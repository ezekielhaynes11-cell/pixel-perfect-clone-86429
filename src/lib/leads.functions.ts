import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OWNER_ID } from "./owner.server";
import { runIngestion, runIngestionForSource, INGESTION_SOURCE_NAMES, type IngestionSourceName } from "./ingest/run.server";
import { backfillApolloForLinkedPhysicians } from "./apollo/service.server";
import { draftOutreachEmail } from "./outreach.server";
import { generateDailyBriefing, type BriefingLead } from "./briefings.server";

export const triggerApolloBackfill = createServerFn({ method: "POST" }).handler(async () => {
  return await backfillApolloForLinkedPhysicians({ limit: 50 });
});

export const INGESTION_SOURCES = INGESTION_SOURCE_NAMES;

// Explicit column list — exclude `raw_payload` (multi-KB jsonb per row) so the
// dashboard payload stays small. LeadDetailModal fetches it on-demand if needed.
const LEAD_LIST_COLUMNS =
  "id, source, source_external_id, source_url, title, summary, confidence, priority, hospital, specialty, territory, entities, estimated_value_usd, win_probability, competitor_incumbent, date_discovered, date_ingested, enriched, vendor_mentions, account_type, signal_type, account_id, source_contacts";

export const listLeads = createServerFn({ method: "GET" }).handler(async () => {
  const { data: dismissed, error: dismissedErr } = await supabaseAdmin
    .from("lead_actions")
    .select("lead_id")
    .eq("user_id", OWNER_ID)
    .eq("action", "dismissed");
  if (dismissedErr) throw new Error(dismissedErr.message);
  const dismissedIds = (dismissed ?? []).map((r) => r.lead_id);

  let q = supabaseAdmin
    .from("leads")
    .select(LEAD_LIST_COLUMNS)
    .eq("enriched", true)
    .order("confidence", { ascending: false })
    .order("date_discovered", { ascending: false })
    .limit(500);
  if (dismissedIds.length > 0) {
    q = q.not("id", "in", `(${dismissedIds.join(",")})`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
});


export const triggerIngestion = createServerFn({ method: "POST" }).handler(async () => {
  return await runIngestion(OWNER_ID);
});

export const triggerIngestionForSource = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ source: z.enum(INGESTION_SOURCE_NAMES) }).parse(input),
  )
  .handler(async ({ data }) => {
    return await runIngestionForSource(data.source as IngestionSourceName, OWNER_ID);
  });

export const listLeadActions = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("lead_actions")
    .select("lead_id, action, note, created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const setLeadAction = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        action: z.enum(["saved", "dismissed", "pushed_sfdc"]),
        note: z.string().max(2000).optional(),
        remove: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.remove) {
      await supabaseAdmin
        .from("lead_actions")
        .delete()
        .eq("lead_id", data.lead_id)
        .eq("user_id", OWNER_ID)
        .eq("action", data.action);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("lead_actions").insert({
      lead_id: data.lead_id,
      user_id: OWNER_ID,
      action: data.action,
      note: data.note ?? null,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

export const bulkSetLeadAction = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        lead_ids: z.array(z.string().uuid()).min(1).max(500),
        action: z.enum(["saved", "dismissed", "pushed_sfdc"]),
        remove: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.remove) {
      const { error } = await supabaseAdmin
        .from("lead_actions")
        .delete()
        .eq("user_id", OWNER_ID)
        .eq("action", data.action)
        .in("lead_id", data.lead_ids);
      if (error) throw new Error(error.message);
      return { ok: true, count: data.lead_ids.length };
    }
    const rows = data.lead_ids.map((id) => ({
      lead_id: id,
      user_id: OWNER_ID,
      action: data.action,
    }));
    const { error } = await supabaseAdmin.from("lead_actions").insert(rows);
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

/* -------------------- Outreach drafts -------------------- */

export const listDraftsForLead = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: rows, error } = await supabaseAdmin
      .from("outreach_drafts")
      .select("*")
      .eq("lead_id", data.lead_id)
      .eq("user_id", OWNER_ID)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const generateOutreachDraft = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        tone: z.enum(["discovery", "follow_up", "executive_intro", "switch_pitch"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: lead, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", data.lead_id)
      .single();
    if (error || !lead) throw new Error("Lead not found");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name")
      .eq("user_id", OWNER_ID)
      .maybeSingle();

    const draft = await draftOutreachEmail({
      lead: {
        title: lead.title,
        summary: lead.summary ?? "",
        hospital: lead.hospital,
        specialty: lead.specialty,
        source: lead.source,
        signal_type: (lead as { signal_type?: string | null }).signal_type ?? null,
        competitor_incumbent: lead.competitor_incumbent,
        vendor_mentions: ((lead as { vendor_mentions?: string[] | null }).vendor_mentions) ?? [],
        entities: (lead.entities as {
          physicians?: string[];
          equipment?: string[];
          keywords?: string[];
        }) ?? {},
      },
      repName: profile?.display_name ?? "Your Philips rep",
      tone: data.tone,
    });

    const { data: saved, error: insErr } = await supabaseAdmin
      .from("outreach_drafts")
      .insert({
        lead_id: data.lead_id,
        user_id: OWNER_ID,
        subject: draft.subject,
        body: draft.body,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return saved;
  });

export const updateOutreachDraft = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("outreach_drafts")
      .update({ subject: data.subject, body: data.body })
      .eq("id", data.id)
      .eq("user_id", OWNER_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Saved searches -------------------- */

const FilterSchema = z.object({
  hospitals: z.array(z.string()).default([]),
  specialties: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  signalTypes: z.array(z.string()).default([]),
  accountTypes: z.array(z.string()).default([]),
  vendors: z.array(z.string()).default([]),
  states: z.array(z.string()).default([]),
  minConfidence: z.number().min(0).max(100).default(0),
});

export const listSavedSearches = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("saved_searches")
    .select("*")
    .eq("user_id", OWNER_ID)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const upsertSavedSearch = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        filter: FilterSchema,
        alert_threshold: z.number().min(0).max(100).default(85),
        alerts_enabled: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("saved_searches")
        .update({
          name: data.name,
          filter: data.filter,
          alert_threshold: data.alert_threshold,
          alerts_enabled: data.alerts_enabled,
        })
        .eq("id", data.id)
        .eq("user_id", OWNER_ID);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("saved_searches")
      .insert({
        user_id: OWNER_ID,
        name: data.name,
        filter: data.filter,
        alert_threshold: data.alert_threshold,
        alerts_enabled: data.alerts_enabled,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const deleteSavedSearch = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("saved_searches")
      .delete()
      .eq("id", data.id)
      .eq("user_id", OWNER_ID);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Alerts -------------------- */

export const listAlerts = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("alerts")
    .select("id, lead_id, created_at, read_at, saved_search_id")
    .eq("user_id", OWNER_ID)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const markAlertRead = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", OWNER_ID);
    return { ok: true };
  });

export const markAllAlertsRead = createServerFn({ method: "POST" }).handler(async () => {
  await supabaseAdmin
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", OWNER_ID)
    .is("read_at", null);
  return { ok: true };
});

/* -------------------- Pipeline forecast -------------------- */

export const getPipelineForecast = createServerFn({ method: "GET" }).handler(async () => {
  const [leadsRes, actionsRes] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select(
        "id, title, hospital, specialty, confidence, estimated_value_usd, win_probability, date_discovered, source",
      )
      // Same base set as the dashboard feed (listLeads): enriched leads minus
      // dismissed ones. This keeps "Open qualified leads" reconciled with the
      // feed count rather than diverging via a separate confidence cut.
      .eq("enriched", true)
      .limit(500),
    supabaseAdmin.from("lead_actions").select("lead_id, action").eq("user_id", OWNER_ID),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);

  const dismissed = new Set(
    (actionsRes.data ?? []).filter((a) => a.action === "dismissed").map((a) => a.lead_id),
  );
  const open = (leadsRes.data ?? []).filter((l) => !dismissed.has(l.id));

  // Effective win probability (0–1). win_probability is frequently NULL in the
  // data, which previously zeroed out the entire weighted pipeline (so the
  // "Weighted Pipeline by Specialty" chart rendered axes but no bars). Fall back
  // to a confidence-derived estimate so the weighting is always populated.
  const winProb = (l: (typeof open)[number]) => {
    const wp = Number(l.win_probability);
    if (Number.isFinite(wp) && wp > 0) return Math.min(1, wp);
    const conf = Number(l.confidence);
    return Number.isFinite(conf) && conf > 0 ? Math.min(1, conf / 100) : 0;
  };

  const weighted = (l: (typeof open)[number]) =>
    (Number(l.estimated_value_usd) || 0) * winProb(l);

  const totalWeighted = open.reduce((s, l) => s + weighted(l), 0);
  const avgConfidence =
    open.length === 0
      ? 0
      : Math.round(open.reduce((s, l) => s + l.confidence, 0) / open.length);

  const bySpecialty: Record<string, number> = {};
  const byHospital: Record<string, number> = {};
  const byWeek: Record<string, number> = {};
  for (const l of open) {
    const sp = l.specialty ?? "Unspecified";
    bySpecialty[sp] = (bySpecialty[sp] ?? 0) + weighted(l);
    const h = l.hospital?.trim() || "Hospital not identified";
    byHospital[h] = (byHospital[h] ?? 0) + weighted(l);
    const wk = new Date(l.date_discovered);
    wk.setUTCDate(wk.getUTCDate() - wk.getUTCDay());
    const wkKey = wk.toISOString().slice(0, 10);
    byWeek[wkKey] = (byWeek[wkKey] ?? 0) + weighted(l);
  }

  const topLeads = open
    .map((l) => ({ ...l, win_probability: winProb(l), weighted: weighted(l) }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 12);

  return {
    totalWeighted,
    openCount: open.length,
    avgConfidence,
    bySpecialty: Object.entries(bySpecialty)
      .map(([k, v]) => ({ name: k, value: Math.round(v) }))
      .sort((a, b) => b.value - a.value),
    byHospital: Object.entries(byHospital)
      .map(([k, v]) => ({ name: k, value: Math.round(v) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
    byWeek: Object.entries(byWeek)
      .map(([k, v]) => ({ week: k, value: Math.round(v) }))
      .sort((a, b) => a.week.localeCompare(b.week)),
    topLeads,
  };
});

/* -------------------- Daily AI briefing -------------------- */

export const getOrCreateDailyBriefing = createServerFn({ method: "POST" }).handler(async () => {
  const today = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabaseAdmin
    .from("briefings")
    .select("*")
    .eq("user_id", OWNER_ID)
    .eq("date", today)
    .maybeSingle();
  if (existing) return existing;

  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, title, summary, hospital, specialty, confidence, estimated_value_usd, win_probability")
    .eq("enriched", true)
    .order("confidence", { ascending: false })
    .limit(5);
  const top = (leads ?? []) as Array<BriefingLead & { id: string }>;
  if (top.length === 0) {
    return {
      date: today,
      markdown:
        "_No enriched leads yet today. Hit **Refresh feed** to pull fresh signals from SAM.gov, FDA and news._",
      top_lead_ids: [] as string[],
    };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("user_id", OWNER_ID)
    .maybeSingle();

  const markdown = await generateDailyBriefing(profile?.display_name ?? "rep", top);

  const { data: saved } = await supabaseAdmin
    .from("briefings")
    .insert({
      user_id: OWNER_ID,
      date: today,
      markdown,
      top_lead_ids: top.map((l) => l.id),
    })
    .select()
    .single();
  return saved;
});

/* -------------------- Ingestion runs -------------------- */

export const getRecentIngestionRuns = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("ingestion_runs")
    .select("source, started_at, finished_at, status, fetched_count, new_count, enriched_count")
    .order("started_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return data ?? [];
});

/* -------------------- Physician contacts -------------------- */

export interface LeadPhysician {
  lead_id: string;
  role: string;
  match_confidence: number;
  npi: string;
  full_name: string;
  credentials: string | null;
  primary_specialty: string | null;
  practice_city: string | null;
  practice_state: string | null;
  practice_phone: string | null;
  practice_address: string | null;
  practice_zip: string | null;
  email: string | null;
  title: string | null;
  linkedin_url: string | null;
  apollo_enriched_at: string | null;
}

export const listLeadPhysicians = createServerFn({ method: "GET" }).handler(async (): Promise<LeadPhysician[]> => {
  const { data, error } = await supabaseAdmin
    .from("lead_physicians")
    .select(
      "lead_id, role, match_confidence, physician_contacts!inner(npi, full_name, credentials, primary_specialty, practice_city, practice_state, practice_phone, practice_address, practice_zip, email, title, linkedin_url, apollo_enriched_at)",
    )
    .limit(2000);
  if (error) throw new Error(error.message);
  type Row = {
    lead_id: string;
    role: string;
    match_confidence: number;
    physician_contacts: {
      npi: string;
      full_name: string;
      credentials: string | null;
      primary_specialty: string | null;
      practice_city: string | null;
      practice_state: string | null;
      practice_phone: string | null;
      practice_address: string | null;
      practice_zip: string | null;
      email: string | null;
      title: string | null;
      linkedin_url: string | null;
      apollo_enriched_at: string | null;
    };
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    lead_id: r.lead_id,
    role: r.role,
    match_confidence: r.match_confidence,
    npi: r.physician_contacts.npi,
    full_name: r.physician_contacts.full_name,
    credentials: r.physician_contacts.credentials,
    primary_specialty: r.physician_contacts.primary_specialty,
    practice_city: r.physician_contacts.practice_city,
    practice_state: r.physician_contacts.practice_state,
    practice_phone: r.physician_contacts.practice_phone,
    practice_address: r.physician_contacts.practice_address,
    practice_zip: r.physician_contacts.practice_zip,
    email: r.physician_contacts.email,
    title: r.physician_contacts.title,
    linkedin_url: r.physician_contacts.linkedin_url,
    apollo_enriched_at: r.physician_contacts.apollo_enriched_at,
  }));
});

/* -------------------- Decision-maker contact enrichment (Apollo) -------------------- */

export interface ContactEnrichmentRow {
  lead_id: string;
  status: "found" | "none";
  name: string | null;
  title: string | null;
  organization: string | null;
  phone: string | null;
  email: string | null;
  linkedin_url: string | null;
  created_at: string;
}

const DECISION_MAKER_TITLES = [
  "Director of Point of Care Ultrasound",
  "POCUS Director",
  "Director of Clinical Ultrasound",
  "Ultrasound Director",
  "Ultrasound Program Director",
  "Director of Imaging",
  "Imaging Director",
  "Clinical Engineering Director",
  "Director of Radiology",
  "Chief of Radiology",
  "Ultrasound Fellowship Director",
];

// Shared waterfall: NPPES (lead_physicians cache) → Apollo (org search) → none.
// Runs fully in-process with supabaseAdmin + the server-side Apollo client, so
// it does NOT depend on the enrich-contact edge function being deployed or its
// secrets being configured. Used by both fetchContactEnrichment (on-demand,
// card expand) and batchEnrichContacts (bulk).
async function runContactWaterfall(leadId: string): Promise<ContactEnrichmentRow> {
  const writeAndReturn = async (
    row: Omit<ContactEnrichmentRow, "created_at">,
  ): Promise<ContactEnrichmentRow> => {
    const { data: saved, error: insErr } = await supabaseAdmin
      .from("contact_enrichment")
      .upsert(row, { onConflict: "lead_id" })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return saved as ContactEnrichmentRow;
  };

  // Step 1: cache — only short-circuit on a confirmed contact; 'none' retries.
  const { data: cached } = await supabaseAdmin
    .from("contact_enrichment")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (cached && cached.status === "found") return cached as ContactEnrichmentRow;

  // Step 2: load lead
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select("hospital, entities")
    .eq("id", leadId)
    .single();
  if (leadErr || !lead) throw new Error("Lead not found");

  // Step 3: NPPES — check lead_physicians cache first
  type PhysJoin = {
    physician_contacts: {
      full_name: string;
      credentials: string | null;
      primary_specialty: string | null;
      practice_phone: string | null;
      practice_city: string | null;
      practice_state: string | null;
      email: string | null;
      title: string | null;
      linkedin_url: string | null;
    } | null;
  };
  const { data: physRows } = await supabaseAdmin
    .from("lead_physicians")
    .select(
      "physician_contacts(full_name, credentials, primary_specialty, practice_phone, practice_city, practice_state, email, title, linkedin_url)",
    )
    .eq("lead_id", leadId)
    .limit(1);
  const phys = (physRows as unknown as PhysJoin[] | null)?.[0]?.physician_contacts;
  if (phys) {
    const name =
      [phys.full_name, phys.credentials].filter(Boolean).join(", ") || phys.full_name;
    const physOrg =
      [phys.practice_city, phys.practice_state].filter(Boolean).join(", ") || null;
    return writeAndReturn({
      lead_id: leadId,
      status: "found",
      name,
      title: phys.title ?? phys.primary_specialty,
      organization: physOrg,
      phone: phys.practice_phone,
      email: phys.email,
      linkedin_url: phys.linkedin_url,
    });
  }

  // Step 4: resolve org name from lead fields
  const ents = (lead.entities as { hospitals?: string[]; physicians?: string[] }) ?? {};
  const org =
    ((lead.hospital as string | null)?.trim() || null) ??
    (ents.hospitals?.[0]?.trim() || null) ??
    (ents.physicians?.[0]?.trim() || null);

  if (!org) {
    return writeAndReturn({
      lead_id: leadId, status: "none",
      name: null, title: null, organization: null,
      phone: null, email: null, linkedin_url: null,
    });
  }

  // Step 5: Apollo fallback (server-side client reads APOLLO_API_KEY from env)
  try {
    const { apolloPeopleSearch } = await import("./apollo/client.server");
    const res = await apolloPeopleSearch({
      organization_name: org,
      person_titles: DECISION_MAKER_TITLES,
      per_page: 10,
    });
    const person = (res.people ?? [])[0];
    if (!person) {
      return writeAndReturn({
        lead_id: leadId, status: "none",
        name: null, title: null, organization: org,
        phone: null, email: null, linkedin_url: null,
      });
    }
    const name =
      person.name ||
      [person.first_name, person.last_name].filter(Boolean).join(" ") ||
      null;
    const phone =
      person.phone_numbers?.[0]?.sanitized_number ??
      person.phone_numbers?.[0]?.raw_number ??
      null;
    return writeAndReturn({
      lead_id: leadId,
      status: "found",
      name,
      title: person.title ?? null,
      organization: person.organization?.name ?? org,
      phone,
      email: person.email ?? null,
      linkedin_url: person.linkedin_url ?? null,
    });
  } catch (e) {
    console.error("[runContactWaterfall]", leadId, "apollo failed:", e instanceof Error ? e.message : e);
    return writeAndReturn({
      lead_id: leadId, status: "none",
      name: null, title: null, organization: org,
      phone: null, email: null, linkedin_url: null,
    });
  }
}

export const enrichLeadContact = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<ContactEnrichmentRow> => {
    return runContactWaterfall(data.lead_id);
  });

export const fetchContactEnrichment = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<ContactEnrichmentRow> => {
    return runContactWaterfall(data.lead_id);
  });

export const batchEnrichContacts = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const limit = data.limit ?? 20;

    const { data: alreadyFound } = await supabaseAdmin
      .from("contact_enrichment")
      .select("lead_id")
      .eq("status", "found");
    const foundSet = new Set((alreadyFound ?? []).map((r) => r.lead_id as string));

    const fetchLimit = Math.min(limit + Math.min(foundSet.size, 100), 200);
    const { data: leads, error } = await supabaseAdmin
      .from("leads")
      .select("id")
      .eq("enriched", true)
      .order("confidence", { ascending: false })
      .order("date_discovered", { ascending: false })
      .limit(fetchLimit);
    if (error) throw new Error(error.message);

    const toProcess = (leads ?? [])
      .filter((l) => !foundSet.has(l.id))
      .slice(0, limit);

    let enriched = 0;
    let errors = 0;
    for (const lead of toProcess) {
      try {
        const result = await runContactWaterfall(lead.id);
        if (result.status === "found") enriched++;
      } catch (e) {
        errors++;
        console.error("[batchEnrichContacts]", lead.id, e instanceof Error ? e.message : e);
      }
    }
    return { enriched, errors, total: toProcess.length };
  });

export const getEnrichedContactCount = createServerFn({ method: "GET" }).handler(async () => {
  const [enrichRes, physRes] = await Promise.all([
    supabaseAdmin
      .from("contact_enrichment")
      .select("lead_id")
      .eq("status", "found")
      .not("name", "is", null)
      .or("phone.not.is.null,email.not.is.null"),
    supabaseAdmin
      .from("lead_physicians")
      .select("lead_id, physician_contacts!inner(full_name, practice_phone, email)"),
  ]);
  type PhysRow = {
    lead_id: string;
    physician_contacts: {
      full_name: string | null;
      practice_phone: string | null;
      email: string | null;
    };
  };
  const physIds = ((physRes.data ?? []) as unknown as PhysRow[])
    .filter(
      (r) =>
        r.physician_contacts.full_name &&
        (r.physician_contacts.practice_phone || r.physician_contacts.email),
    )
    .map((r) => r.lead_id);
  const ids = new Set([
    ...(enrichRes.data ?? []).map((r) => r.lead_id),
    ...physIds,
  ]);
  return { count: ids.size };
});
