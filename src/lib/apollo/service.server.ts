// Higher-level Apollo operations that touch the database.
// Imported by both copilot-tools.server.ts (for Copilot tool calls) and
// apollo.functions.ts (for direct UI button calls).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  apolloOrgSearch,
  apolloPeopleSearch,
  apolloPersonMatch,
  type ApolloPerson,
} from "./client.server";

const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  OK: "Oklahoma",
  AR: "Arkansas",
  LA: "Louisiana",
};

function stateToLocation(state?: string | null): string | undefined {
  if (!state) return undefined;
  const up = state.toUpperCase();
  return STATE_NAMES[up] ? `${STATE_NAMES[up]}, US` : `${state}, US`;
}

function firstPhone(p: ApolloPerson): string | null {
  const n = p.phone_numbers?.[0];
  return n?.sanitized_number ?? n?.raw_number ?? null;
}

// ── Enrich an existing physician_contact row by NPI ──────────────────────────
export async function apolloEnrichPhysician(args: { npi: string }) {
  const { data: existing, error: readErr } = await supabaseAdmin
    .from("physician_contacts")
    .select("npi, full_name, practice_state, email, title, linkedin_url, apollo_id")
    .eq("npi", args.npi)
    .maybeSingle();
  if (readErr) return { error: readErr.message };
  if (!existing) return { error: "Physician not found" };

  const [first, ...rest] = (existing.full_name ?? "").trim().split(/\s+/);
  const last = rest.join(" ");
  const matched = await apolloPersonMatch({
    first_name: first,
    last_name: last,
    name: existing.full_name ?? undefined,
  });
  const p = matched.person;
  if (!p) return { exists: false, message: "No Apollo match for this physician." };

  const patch: Record<string, unknown> = {
    apollo_id: p.id,
    apollo_enriched_at: new Date().toISOString(),
  };
  if (p.email) patch.email = p.email;
  if (p.title) patch.title = p.title;
  if (p.linkedin_url) patch.linkedin_url = p.linkedin_url;
  const phone = firstPhone(p);
  if (phone && !existing.email /* don't clobber human-entered numbers */) patch.practice_phone = phone;

  const { error: upErr } = await supabaseAdmin
    .from("physician_contacts")
    .update(patch)
    .eq("npi", args.npi);
  if (upErr) return { error: upErr.message };

  return {
    exists: true,
    npi: args.npi,
    email: p.email ?? null,
    title: p.title ?? null,
    linkedin_url: p.linkedin_url ?? null,
    phone,
  };
}

// ── Enrich an account with Apollo organisation data ──────────────────────────
export async function apolloEnrichAccount(args: { account_id: string }) {
  const { data: account, error } = await supabaseAdmin
    .from("accounts")
    .select("id, name, state, domain, apollo_org_id")
    .eq("id", args.account_id)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!account) return { error: "Account not found" };

  const loc = stateToLocation(account.state);
  const res = await apolloOrgSearch({
    q_organization_name: account.name,
    organization_locations: loc ? [loc] : undefined,
    per_page: 3,
  });
  const org = res.organizations?.[0];
  if (!org) return { exists: false, message: "No Apollo organisation match." };

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
    industry: org.industry ?? null,
    description: org.short_description ?? null,
  };
}

// ── Prospect new contacts and persist them to physician_contacts ─────────────
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
  const loc = stateToLocation(stateRaw);

  const limit = Math.min(args.limit ?? 25, 50);
  const res = await apolloPeopleSearch({
    person_titles:
      args.titles && args.titles.length > 0
        ? args.titles
        : ["POCUS Director", "Ultrasound Director", "Medical Director", "Chief of Radiology"],
    q_keywords: args.keywords,
    person_locations: loc ? [loc] : undefined,
    organization_name: accountName,
    per_page: limit,
  });

  const people = res.people ?? [];
  if (people.length === 0) return { count: 0, contacts: [] };

  // Upsert by apollo_id. NPI is NOT NULL on the table, so synthesize a stable
  // surrogate NPI for non-NPI contacts: "APL-<apollo_id>".
  const rows = people
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
        practice_state: p.state ?? stateRaw ?? null,
        primary_specialty: p.headline ?? null,
        apollo_enriched_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      };
    });

  const { data: inserted, error } = await supabaseAdmin
    .from("physician_contacts")
    .upsert(rows, { onConflict: "apollo_id" })
    .select("npi, full_name, title, email, practice_city, practice_state, linkedin_url");
  if (error) return { error: error.message };

  // Optionally link these contacts to the account via lead_physicians is heavy;
  // we just return what we wrote. UI can browse via /accounts/$id physicians.
  return { count: inserted?.length ?? 0, contacts: inserted ?? [] };
}
