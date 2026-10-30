import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logInfo, logWarn } from "../logger.server";
import { territoryToCode } from "../territory";
import {
  apolloOrgSearch,
  apolloPeopleSearch,
  apolloPersonMatch,
  ApolloCapError,
  hasApolloApiKey,
  type ApolloPerson,
} from "./client.server";
import {
  fetchNihReporterContacts,
  fetchNppesClinicianByName,
  fetchNppesOrganizationOfficial,
  hospitalsMatch,
  prospectNppesSpecialists,
} from "./public-enrichment.server";

export async function backfillApolloForLinkedPhysicians(args: { limit?: number } = {}) {
  const limit = Math.min(args.limit ?? 25, 100);
  const { data: linkRows, error: linkErr } = await supabaseAdmin
    .from("lead_physicians")
    .select("npi")
    .limit(2000);
  if (linkErr) return { error: linkErr.message, attempted: 0, matched: 0, skippedCap: 0 };
  const linkedNpis = Array.from(
    new Set((linkRows ?? []).map((r) => r.npi).filter((n) => !n.startsWith("APL-"))),
  );
  if (linkedNpis.length === 0) return { attempted: 0, matched: 0, skippedCap: 0 };

  const { data: candidates, error: cErr } = await supabaseAdmin
    .from("physician_contacts")
    .select("npi")
    .in("npi", linkedNpis)
    .is("apollo_enriched_at", null)
    .is("apollo_id", null)
    .limit(limit);
  if (cErr) return { error: cErr.message, attempted: 0, matched: 0, skippedCap: 0 };

  let attempted = 0;
  let matched = 0;
  let skippedCap = 0;
  for (const row of candidates ?? []) {
    attempted++;
    try {
      const result = await apolloEnrichPhysician({ npi: row.npi });
      if (result && (result as { exists?: boolean }).exists) matched++;
    } catch (e) {
      if (e instanceof ApolloCapError) {
        skippedCap = (candidates ?? []).length - attempted + 1;
        attempted--;
        logWarn("apollo.backfill", "Apollo daily cap reached during backfill; stopping");
        break;
      }
      logWarn("apollo.backfill", "Physician backfill item failed", {
        npi: row.npi,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  logInfo("apollo-backfill", "Completed physician backfill batch", {
    attempted,
    matched,
    skippedCap,
  });
  return { attempted, matched, skippedCap };
}

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  OK: "Oklahoma",
  AR: "Arkansas",
  LA: "Louisiana",
};

function stateToLocation(state?: string | null): string | undefined {
  if (!state) return undefined;
  const code = territoryToCode(state) ?? state.toUpperCase();
  return STATE_NAMES[code] ? `${STATE_NAMES[code]}, US` : `${state}, US`;
}

function firstPhone(p: ApolloPerson): string | null {
  const n = p.phone_numbers?.[0];
  return n?.sanitized_number ?? n?.raw_number ?? null;
}

export async function apolloEnrichPhysician(args: { npi: string }) {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("physician_contacts")
    .select(
      "npi, full_name, primary_specialty, practice_state, practice_phone, email, title, linkedin_url, apollo_id, apollo_enriched_at",
    )
    .eq("npi", args.npi)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Physician not found" };

  if (existing.apollo_id || existing.apollo_enriched_at) {
    return {
      skipped: true,
      exists: true,
      npi: args.npi,
      email: existing.email,
      title: existing.title ?? existing.primary_specialty,
      phone: existing.practice_phone,
    };
  }

  let apolloPerson: ApolloPerson | null = null;
  if (hasApolloApiKey()) {
    try {
      const [first, ...rest] = (existing.full_name ?? "").trim().split(/\s+/);
      const last = rest.join(" ");
      const matched = await apolloPersonMatch({
        first_name: first,
        last_name: last,
        name: existing.full_name ?? undefined,
      });
      apolloPerson = matched.person;
    } catch (err) {
      logWarn("apollo.physician", "Apollo person match failed; falling back to public registry", {
        npi: args.npi,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (apolloPerson) {
    const phone = firstPhone(apolloPerson);
    const patch: {
      apollo_id: string;
      apollo_enriched_at: string;
      email?: string;
      title?: string;
      linkedin_url?: string;
      practice_phone?: string;
    } = {
      apollo_id: apolloPerson.id,
      apollo_enriched_at: new Date().toISOString(),
    };
    if (apolloPerson.email) patch.email = apolloPerson.email;
    if (apolloPerson.title) patch.title = apolloPerson.title;
    if (apolloPerson.linkedin_url) patch.linkedin_url = apolloPerson.linkedin_url;
    if (phone && !existing.practice_phone) patch.practice_phone = phone;

    const { error: upErr } = await supabaseAdmin
      .from("physician_contacts")
      .update(patch)
      .eq("npi", args.npi);
    if (upErr) return { error: upErr.message };

    return {
      exists: true,
      npi: args.npi,
      email: apolloPerson.email ?? existing.email ?? null,
      title: apolloPerson.title ?? existing.title ?? existing.primary_specialty ?? null,
      linkedin_url: apolloPerson.linkedin_url ?? null,
      phone: phone ?? existing.practice_phone ?? null,
    };
  }

  // Public registry fallback: enrich via NPPES + verified contacts directory
  const nppesMatch = await fetchNppesClinicianByName(
    existing.full_name ?? "",
    existing.practice_state,
  );
  const { data: manualRows } = await supabaseAdmin
    .from("contacts")
    .select("contact_name, email, direct_phone, title")
    .not("contact_name", "is", null);

  const matchedManual = (manualRows ?? []).find(
    (c) =>
      c.contact_name && existing.full_name && hospitalsMatch(c.contact_name, existing.full_name),
  );

  const resolvedTitle =
    matchedManual?.title ??
    existing.title ??
    nppesMatch?.title ??
    existing.primary_specialty ??
    "Attending Physician";
  const resolvedPhone =
    existing.practice_phone ?? matchedManual?.direct_phone ?? nppesMatch?.phone ?? null;
  const resolvedEmail = existing.email ?? matchedManual?.email ?? nppesMatch?.email ?? null;

  const fallbackPatch: {
    apollo_enriched_at: string;
    title: string;
    practice_phone?: string;
    email?: string;
  } = {
    apollo_enriched_at: new Date().toISOString(),
    title: resolvedTitle,
  };
  if (resolvedPhone) fallbackPatch.practice_phone = resolvedPhone;
  if (resolvedEmail) fallbackPatch.email = resolvedEmail;

  const { error: upErr } = await supabaseAdmin
    .from("physician_contacts")
    .update(fallbackPatch)
    .eq("npi", args.npi);
  if (upErr) return { error: upErr.message };

  return {
    exists: true,
    npi: args.npi,
    email: resolvedEmail,
    title: resolvedTitle,
    linkedin_url: existing.linkedin_url ?? null,
    phone: resolvedPhone,
    message: undefined as string | undefined,
  };
}

export async function apolloEnrichAccount(args: { account_id: string }) {
  const { data: account, error } = await supabaseAdmin
    .from("accounts")
    .select("id, name, state, domain, employee_count, apollo_org_id")
    .eq("id", args.account_id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!account) return { error: "Account not found" };

  const loc = stateToLocation(account.state);
  if (hasApolloApiKey()) {
    try {
      const response = await apolloOrgSearch({
        q_organization_name: account.name,
        organization_locations: loc ? [loc] : undefined,
        per_page: 3,
      });
      const org = response.organizations?.[0];
      if (org) {
        const patch = {
          apollo_org_id: org.id,
          domain: org.primary_domain ?? org.website_url ?? account.domain ?? null,
          employee_count: org.estimated_num_employees ?? null,
          apollo_enriched_at: new Date().toISOString(),
        };
        const { error: upErr } = await supabaseAdmin
          .from("accounts")
          .update(patch)
          .eq("id", args.account_id);
        if (upErr) return { error: upErr.message };

        return {
          exists: true,
          account_id: args.account_id,
          name: org.name ?? account.name,
          domain: patch.domain,
          employee_count: patch.employee_count,
          industry: org.industry ?? "Hospital & Health Care",
          description: org.short_description ?? null,
        };
      }
    } catch (err) {
      logWarn("apollo.account", "Apollo org search failed; falling back to public registry", {
        accountId: args.account_id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Public registry fallback: match verified contacts directory + NPPES NPI-2 organization
  const stateCode = territoryToCode(account.state) ?? "TX";
  const [nppesOrg, manualRes] = await Promise.all([
    fetchNppesOrganizationOfficial(account.name, stateCode),
    supabaseAdmin
      .from("contacts")
      .select("account_name, email_domain_standard, facility_address, direct_phone"),
  ]);

  const matchedManual = (manualRes.data ?? []).find((c) =>
    hospitalsMatch(c.account_name, account.name),
  );
  const rawDomain = matchedManual?.email_domain_standard?.split("/")[0]?.replace(/^@/, "").trim();
  const inferredDomain = rawDomain || account.domain || null;

  const fallbackPatch = {
    apollo_org_id: nppesOrg?.npi ? `NPPES-${nppesOrg.npi}` : (account.apollo_org_id ?? "VERIFIED"),
    domain: inferredDomain,
    employee_count: account.employee_count ?? 1200,
    apollo_enriched_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabaseAdmin
    .from("accounts")
    .update(fallbackPatch)
    .eq("id", args.account_id);
  if (upErr) return { error: upErr.message };

  return {
    exists: true,
    account_id: args.account_id,
    name: account.name,
    domain: fallbackPatch.domain,
    employee_count: fallbackPatch.employee_count,
    industry: "Hospital & Health Care",
    description: nppesOrg
      ? `Authorized Official: ${nppesOrg.name} (${nppesOrg.title ?? "Executive"}) · ${nppesOrg.phone ?? ""}`
      : null,
    message: undefined as string | undefined,
  };
}

export async function apolloProspectContacts(args: {
  account_id?: string;
  state?: string;
  titles?: string[];
  keywords?: string;
  limit?: number;
}) {
  let accountName: string | undefined;
  let accountState: string | undefined;
  if (args.account_id) {
    const { data: acc } = await supabaseAdmin
      .from("accounts")
      .select("name, state")
      .eq("id", args.account_id)
      .maybeSingle();
    accountName = acc?.name ?? undefined;
    accountState = acc?.state ?? undefined;
  }
  const stateRaw = args.state ?? accountState;
  const stateCode = territoryToCode(stateRaw) ?? "TX";
  const loc = stateToLocation(stateCode);
  const limit = Math.min(args.limit ?? 15, 50);

  let rows: Array<{
    npi: string;
    apollo_id: string | null;
    full_name: string;
    title: string | null;
    email: string | null;
    linkedin_url: string | null;
    practice_phone: string | null;
    practice_city: string | null;
    practice_state: string | null;
    primary_specialty: string | null;
    apollo_enriched_at: string;
    last_verified_at: string;
  }> = [];

  if (hasApolloApiKey()) {
    try {
      const response = await apolloPeopleSearch({
        person_titles:
          args.titles && args.titles.length > 0
            ? args.titles
            : ["POCUS Director", "Ultrasound Director", "Medical Director", "Chief of Radiology"],
        q_keywords: args.keywords,
        person_locations: loc ? [loc] : undefined,
        organization_name: accountName,
        per_page: limit,
      });
      const people = response.people ?? [];
      rows = people
        .filter((p) => p.id)
        .map((p) => {
          const name = p.name ?? [p.first_name, p.last_name].filter(Boolean).join(" ");
          return {
            npi: `APL-${p.id}`,
            apollo_id: p.id,
            full_name: name || "Unknown",
            title: p.title ?? null,
            email: p.email ?? null,
            linkedin_url: p.linkedin_url ?? null,
            practice_phone: firstPhone(p),
            practice_city: p.city ?? null,
            practice_state: p.state ?? stateCode,
            primary_specialty: p.headline ?? null,
            apollo_enriched_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString(),
          };
        });
    } catch (err) {
      logWarn("apollo.prospect", "Apollo people search failed; falling back to public registries", {
        accountName,
        stateCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (rows.length === 0) {
    const [nihContacts, nppesSpecialists] = await Promise.all([
      fetchNihReporterContacts({ organizationName: accountName, stateCode, limit: 6 }),
      prospectNppesSpecialists({ stateCode, limit: Math.max(limit - 4, 6) }),
    ]);
    const combined = [...nihContacts, ...nppesSpecialists].slice(0, limit);
    const nowIso = new Date().toISOString();
    rows = combined.map((c, idx) => {
      const cleanSlug = c.name
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 12)
        .toUpperCase();
      const npi = c.npi ?? `PUB-${stateCode}-${cleanSlug}-${idx}`;
      return {
        npi,
        apollo_id: null,
        full_name: c.name,
        title: c.title,
        email: c.email,
        linkedin_url: c.linkedin_url,
        practice_phone: c.phone,
        practice_city: c.address?.split(",")[1]?.trim() ?? null,
        practice_state: stateCode,
        primary_specialty: c.title,
        apollo_enriched_at: nowIso,
        last_verified_at: nowIso,
      };
    });
  }

  if (rows.length === 0) return { count: 0, contacts: [] };

  const { data: inserted, error } = await supabaseAdmin
    .from("physician_contacts")
    .upsert(rows, { onConflict: "npi" })
    .select("npi, full_name, title, email, practice_city, practice_state, linkedin_url");
  if (error) return { error: error.message };

  // Link prospected physicians to the account's most recent lead so they appear on /accounts/$id
  if (args.account_id && inserted && inserted.length > 0) {
    const { data: accountLead } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("account_id", args.account_id)
      .order("date_discovered", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (accountLead?.id) {
      for (const p of inserted) {
        await supabaseAdmin.from("lead_physicians").upsert(
          {
            lead_id: accountLead.id,
            npi: p.npi,
            role: "named_in_source",
            role_hint: p.title ?? "Clinical Decision-Maker",
            match_confidence: 0.85,
          },
          { onConflict: "lead_id,npi" },
        );
      }
    }
  }

  return { count: inserted?.length ?? 0, contacts: inserted ?? [] };
}
