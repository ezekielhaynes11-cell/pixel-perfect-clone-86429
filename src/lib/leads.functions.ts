import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { OWNER_ID } from "./owner.server";
import { logWarn } from "./logger.server";
import { sanitizeErrorText } from "./ingest/medical-gate";
import {
  runIngestion,
  runIngestionForSource,
  INGESTION_SOURCE_NAMES,
  type IngestionSourceName,
} from "./ingest/run.server";
import { draftOutreachEmail } from "./outreach.server";
import { ACTIVE_LEAD_WINDOW_MS } from "@/data/leads";
import { throwIfError, throwUnlessDuplicate } from "./supabase-errors";

export const INGESTION_SOURCES = INGESTION_SOURCE_NAMES;

// Explicit column list — exclude `raw_payload` (multi-KB jsonb per row) so the
// dashboard payload stays small. LeadDetailModal fetches it on-demand if needed.
const LEAD_LIST_COLUMNS =
  "id, source, source_external_id, source_url, title, summary, confidence, priority, hospital, specialty, territory, entities, estimated_value_usd, win_probability, competitor_incumbent, date_discovered, date_ingested, enriched, vendor_mentions, account_type, signal_type, account_id, source_contacts";

const MIN_QUALIFIED_CONFIDENCE = 35;

function getActiveCutoffIso(): string {
  return new Date(Date.now() - ACTIVE_LEAD_WINDOW_MS).toISOString();
}

// Active leads exclude historical pulls older than ACTIVE_LEAD_WINDOW_MS (archiving
// the original May–September batches without deleting rows). Passing includeArchived=true
// appends historical archived leads on demand.
export const listLeads = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ includeArchived: z.boolean().default(false) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const activeCutoff = getActiveCutoffIso();
    const activePromise = supabaseAdmin
      .from("leads")
      .select(LEAD_LIST_COLUMNS)
      .eq("enriched", true)
      .gte("date_ingested", activeCutoff)
      .gte("confidence", MIN_QUALIFIED_CONFIDENCE)
      .order("confidence", { ascending: false })
      .order("date_ingested", { ascending: false })
      .limit(500);

    if (!data.includeArchived) {
      const activeRes = await activePromise;
      throwIfError(activeRes.error);
      return activeRes.data ?? [];
    }

    const [activeRes, archivedRes] = await Promise.all([
      activePromise,
      supabaseAdmin
        .from("leads")
        .select(LEAD_LIST_COLUMNS)
        .eq("enriched", true)
        .lt("date_ingested", activeCutoff)
        .order("confidence", { ascending: false })
        .order("date_discovered", { ascending: false })
        .limit(500),
    ]);
    throwIfError(activeRes.error);
    throwIfError(archivedRes.error);

    return [...(activeRes.data ?? []), ...(archivedRes.data ?? [])];
  });

export const getArchivedLeadCount = createServerFn({ method: "GET" }).handler(async () => {
  const activeCutoff = getActiveCutoffIso();
  const { count, error } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("enriched", true)
    .lt("date_ingested", activeCutoff);
  throwIfError(error);
  return { count: count ?? 0 };
});

export const triggerIngestion = createServerFn({ method: "POST" }).handler(async () => {
  return await runIngestion(OWNER_ID);
});

export const triggerIngestionForSource = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ source: z.enum(INGESTION_SOURCE_NAMES) }).parse(input))
  .handler(async ({ data }) => {
    return await runIngestionForSource(data.source as IngestionSourceName, OWNER_ID);
  });

export const listLeadActions = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("lead_actions")
    .select("lead_id, action, note, created_at")
    .eq("user_id", OWNER_ID);
  throwIfError(error);
  return data ?? [];
});

// Workflow actions the rep can toggle on a lead. 'note' is persisted separately
// via saveLeadNote (it carries free text rather than being a boolean flag).
const LEAD_ACTION = z.enum(["saved", "dismissed", "pushed_sfdc", "contacted"]);

export const setLeadAction = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        action: LEAD_ACTION,
        note: z.string().max(2000).optional(),
        remove: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.remove) {
      const { error } = await supabaseAdmin
        .from("lead_actions")
        .delete()
        .eq("lead_id", data.lead_id)
        .eq("user_id", OWNER_ID)
        .eq("action", data.action);
      throwIfError(error);
      return { ok: true };
    }
    const { error } = await supabaseAdmin.from("lead_actions").insert({
      lead_id: data.lead_id,
      user_id: OWNER_ID,
      action: data.action,
      note: data.note ?? null,
    });
    throwUnlessDuplicate(error);
    return { ok: true };
  });

export const bulkSetLeadAction = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        lead_ids: z.array(z.string().uuid()).min(1).max(500),
        action: LEAD_ACTION,
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
      throwIfError(error);
      return { ok: true, count: data.lead_ids.length };
    }
    const rows = data.lead_ids.map((id) => ({
      lead_id: id,
      user_id: OWNER_ID,
      action: data.action,
    }));
    // Upsert with ignoreDuplicates so a single already-existing (lead,user,action)
    // row can't abort the whole atomic insert and silently drop the other writes.
    const { error } = await supabaseAdmin
      .from("lead_actions")
      .upsert(rows, { onConflict: "lead_id,user_id,action", ignoreDuplicates: true });
    throwIfError(error);
    return { ok: true, count: rows.length };
  });

/* -------------------- Lead notes -------------------- */

export const getLeadNote = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: row, error } = await supabaseAdmin
      .from("lead_actions")
      .select("note")
      .eq("lead_id", data.lead_id)
      .eq("user_id", OWNER_ID)
      .eq("action", "note")
      .maybeSingle();
    throwIfError(error);
    return { note: row?.note ?? "" };
  });

export const saveLeadNote = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ lead_id: z.string().uuid(), note: z.string().max(2000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("lead_actions")
      .upsert(
        { lead_id: data.lead_id, user_id: OWNER_ID, action: "note", note: data.note },
        { onConflict: "lead_id,user_id,action" },
      );
    throwIfError(error);
    return { ok: true };
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
        vendor_mentions: (lead as { vendor_mentions?: string[] | null }).vendor_mentions ?? [],
        entities:
          (lead.entities as {
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
  onlyToday: z.boolean().default(false),
  onlyHighPriority: z.boolean().default(false),
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
    const { error } = await supabaseAdmin
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", OWNER_ID);
    throwIfError(error);
    return { ok: true };
  });

export const markAllAlertsRead = createServerFn({ method: "POST" }).handler(async () => {
  const { error } = await supabaseAdmin
    .from("alerts")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", OWNER_ID)
    .is("read_at", null);
  throwIfError(error);
  return { ok: true };
});

/* -------------------- Pipeline forecast -------------------- */

export const getPipelineForecast = createServerFn({ method: "GET" }).handler(async () => {
  const activeCutoff = getActiveCutoffIso();
  const [leadsRes, actionsRes] = await Promise.all([
    supabaseAdmin
      .from("leads")
      .select(
        "id, title, hospital, specialty, confidence, estimated_value_usd, win_probability, date_discovered, source",
      )
      .eq("enriched", true)
      .gte("date_ingested", activeCutoff)
      .gte("confidence", MIN_QUALIFIED_CONFIDENCE)
      .order("confidence", { ascending: false })
      .order("date_ingested", { ascending: false })
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

  const weighted = (l: (typeof open)[number]) => (Number(l.estimated_value_usd) || 0) * winProb(l);

  const totalWeighted = open.reduce((s, l) => s + weighted(l), 0);
  const avgConfidence =
    open.length === 0 ? 0 : Math.round(open.reduce((s, l) => s + l.confidence, 0) / open.length);

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

/* -------------------- Ingestion runs -------------------- */

export const getRecentIngestionRuns = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("ingestion_runs")
    .select(
      "source, started_at, finished_at, status, fetched_count, new_count, enriched_count, error",
    )
    .order("started_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...row,
    error: row.error ? sanitizeErrorText(row.error, 240) : null,
  }));
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

export const listLeadPhysicians = createServerFn({ method: "GET" }).handler(
  async (): Promise<LeadPhysician[]> => {
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
  },
);

/* -------------------- Manually-sourced contacts (contacts table) -------------------- */

export interface ManualContact {
  id: string;
  account_name: string;
  contact_name: string | null;
  title: string | null;
  alt_contact: string | null;
  direct_phone: string | null;
  department_phone: string | null;
  email: string | null;
  alt_email: string | null;
  email_domain_standard: string | null;
  facility_address: string | null;
  needs_manual_sourcing: boolean;
  source: string;
}

const MANUAL_CONTACT_COLUMNS =
  "id, account_name, contact_name, title, alt_contact, direct_phone, department_phone, email, alt_email, email_domain_standard, facility_address, needs_manual_sourcing, source";

// Decision-maker contacts seeded into the `contacts` table and linked to a lead
// by explicit `lead_id` OR fuzzy normalized hospital/account match.
export const listLeadContacts = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<ManualContact[]> => {
    const { hospitalsMatch } = await import("./apollo/public-enrichment.server");
    const [leadRes, allManualRes] = await Promise.all([
      supabaseAdmin.from("leads").select("hospital, entities").eq("id", data.lead_id).maybeSingle(),
      supabaseAdmin
        .from("contacts")
        .select(`${MANUAL_CONTACT_COLUMNS}, lead_id`)
        .order("needs_manual_sourcing", { ascending: true })
        .order("contact_name", { ascending: true, nullsFirst: false }),
    ]);
    if (allManualRes.error) throw new Error(allManualRes.error.message);

    const leadRow = leadRes.data;
    const ents = (leadRow?.entities as { hospitals?: string[] } | null) ?? {};
    const candidateHospitals = [leadRow?.hospital ?? null, ...(ents.hospitals ?? [])].filter(
      (h): h is string => Boolean(h && h.trim().length > 0),
    );

    type ManualRowWithLead = ManualContact & { lead_id: string | null };
    const allRows = (allManualRes.data ?? []) as ManualRowWithLead[];
    const matched = allRows.filter((row) => {
      if (row.lead_id === data.lead_id) return true;
      return candidateHospitals.some((hosp) => hospitalsMatch(row.account_name, hosp));
    });

    return matched.map(({ lead_id: _unusedLeadId, ...rest }) => rest);
  });

/* -------------------- Decision-maker contact enrichment (Apollo + Public Waterfall) -------------------- */

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

export const getCachedContactEnrichment = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }): Promise<ContactEnrichmentRow | null> => {
    const { data: cached } = await supabaseAdmin
      .from("contact_enrichment")
      .select("*")
      .eq("lead_id", data.lead_id)
      .eq("status", "found")
      .maybeSingle();
    return (cached as ContactEnrichmentRow | null) ?? null;
  });

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

async function persistSourceContactIfEmpty(
  leadId: string,
  existingSourceContacts: unknown,
  resolved: {
    name: string | null;
    title: string | null;
    organization: string | null;
    phone: string | null;
    email: string | null;
    address?: string | null;
    origin?: string;
  },
): Promise<void> {
  if (!resolved.name) return;
  const hasExisting = Array.isArray(existingSourceContacts) && existingSourceContacts.length > 0;
  if (hasExisting) return;

  await supabaseAdmin
    .from("leads")
    .update({
      source_contacts: [
        {
          name: resolved.name,
          title: resolved.title,
          organization: resolved.organization,
          phone: resolved.phone,
          email: resolved.email,
          address: resolved.address ?? null,
          type: "primary",
          source_origin: resolved.origin ?? "enriched",
        },
      ] as never,
    })
    .eq("id", leadId);
}

// Multi-tier waterfall:
// 1. Confirmed contact_enrichment cache
// 2. NPPES lead_physicians cache
// 3. Lead source_contacts
// 4. Verified contacts table (by lead_id or fuzzy hospital match)
// 5. Apollo.io (when APOLLO_API_KEY is configured and available)
// 6. Public clinical & federal waterfall (ClinicalTrials.gov v2 -> NIH RePORTER -> CMS NPPES NPI-2/NPI-1 -> Territory specialty directory)
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

  // Step 1: cache — only short-circuit on a confirmed contact with actionable details
  const { data: cached } = await supabaseAdmin
    .from("contact_enrichment")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (cached && cached.status === "found" && cached.name && (cached.phone || cached.email)) {
    return cached as ContactEnrichmentRow;
  }

  // Step 2: load lead
  const { data: lead, error: leadErr } = await supabaseAdmin
    .from("leads")
    .select(
      "id, source, source_external_id, title, hospital, specialty, territory, signal_type, entities, source_contacts",
    )
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
  if (phys && (phys.practice_phone || phys.email)) {
    const name = [phys.full_name, phys.credentials].filter(Boolean).join(", ") || phys.full_name;
    const physOrg = [phys.practice_city, phys.practice_state].filter(Boolean).join(", ") || null;
    return writeAndReturn({
      lead_id: leadId,
      status: "found",
      name,
      title: phys.title ?? phys.primary_specialty,
      organization: (lead.hospital as string | null) ?? physOrg,
      phone: phys.practice_phone,
      email: phys.email,
      linkedin_url: phys.linkedin_url,
    });
  }

  // Step 4: check existing source_contacts on the lead row
  const existingSourceList = Array.isArray(lead.source_contacts)
    ? (lead.source_contacts as Array<{
        name?: string | null;
        title?: string | null;
        organization?: string | null;
        phone?: string | null;
        email?: string | null;
      }>)
    : [];
  const bestSourceContact =
    existingSourceList.find((c) => c.name && (c.phone || c.email)) ?? existingSourceList[0];
  if (bestSourceContact?.name && (bestSourceContact.phone || bestSourceContact.email)) {
    return writeAndReturn({
      lead_id: leadId,
      status: "found",
      name: bestSourceContact.name,
      title: bestSourceContact.title ?? "Clinical Contact",
      organization: bestSourceContact.organization ?? (lead.hospital as string | null),
      phone: bestSourceContact.phone ?? null,
      email: bestSourceContact.email ?? null,
      linkedin_url: null,
    });
  }

  const {
    fetchClinicalTrialContacts,
    fetchNihReporterContacts,
    fetchNppesClinicianByName,
    fetchNppesOrganizationOfficial,
    hospitalsMatch,
    prospectNppesSpecialists,
    resolveTerritoryStateCode,
  } = await import("./apollo/public-enrichment.server");

  const ents = (lead.entities as { hospitals?: string[]; physicians?: string[] }) ?? {};
  const org =
    ((lead.hospital as string | null)?.trim() || null) ?? (ents.hospitals?.[0]?.trim() || null);
  const stateCode = resolveTerritoryStateCode(lead.territory as string | null);

  // Step 5: check verified contacts table by lead_id OR fuzzy hospital match
  const { data: allManual } = await supabaseAdmin
    .from("contacts")
    .select(`${MANUAL_CONTACT_COLUMNS}, lead_id`);
  type ManualWithLead = ManualContact & { lead_id: string | null };
  const manualList = (allManual ?? []) as ManualWithLead[];
  const matchedManual = manualList.find(
    (c) =>
      c.lead_id === leadId ||
      (org != null && hospitalsMatch(c.account_name, org)) ||
      (ents.hospitals ?? []).some((h) => hospitalsMatch(c.account_name, h)),
  );

  if (
    matchedManual?.contact_name &&
    (matchedManual.direct_phone || matchedManual.department_phone || matchedManual.email)
  ) {
    const phone = matchedManual.direct_phone ?? matchedManual.department_phone;
    await persistSourceContactIfEmpty(leadId, lead.source_contacts, {
      name: matchedManual.contact_name,
      title: matchedManual.title,
      organization: matchedManual.account_name,
      phone,
      email: matchedManual.email,
      address: matchedManual.facility_address,
      origin: "Verified Directory",
    });
    return writeAndReturn({
      lead_id: leadId,
      status: "found",
      name: matchedManual.contact_name,
      title: matchedManual.title,
      organization: matchedManual.account_name,
      phone,
      email: matchedManual.email,
      linkedin_url: null,
    });
  }

  // Step 6: Apollo (when APOLLO_API_KEY is configured and org is known)
  const { apolloPeopleSearch, hasApolloApiKey } = await import("./apollo/client.server");
  if (org && hasApolloApiKey()) {
    try {
      const searchResult = await apolloPeopleSearch({
        organization_name: org,
        person_titles: DECISION_MAKER_TITLES,
        per_page: 10,
      });
      const person = (searchResult.people ?? [])[0];
      if (person) {
        const name =
          person.name || [person.first_name, person.last_name].filter(Boolean).join(" ") || null;
        const phone =
          person.phone_numbers?.[0]?.sanitized_number ??
          person.phone_numbers?.[0]?.raw_number ??
          null;
        if (name) {
          await persistSourceContactIfEmpty(leadId, lead.source_contacts, {
            name,
            title: person.title ?? null,
            organization: person.organization?.name ?? org,
            phone,
            email: person.email ?? null,
            origin: "Apollo",
          });
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
        }
      }
    } catch (e) {
      logWarn(
        "contacts.waterfall",
        "Apollo people search unavailable; cascading to public clinical registries",
        {
          leadId,
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }
  }

  // Step 7: Public Clinical & Federal Contact Waterfall
  // 7a: ClinicalTrials.gov v2 study contacts & principal investigators
  const extId = (lead.source_external_id as string | null) ?? "";
  if (lead.source === "clinicaltrials" || /^NCT\d+$/i.test(extId)) {
    const ctContacts = await fetchClinicalTrialContacts(extId, org);
    const bestCt = ctContacts[0];
    if (bestCt) {
      const mergedPhone =
        bestCt.phone ?? matchedManual?.direct_phone ?? matchedManual?.department_phone ?? null;
      const mergedEmail = bestCt.email ?? matchedManual?.email ?? null;
      const mergedOrg = bestCt.organization ?? org ?? matchedManual?.account_name ?? null;
      await persistSourceContactIfEmpty(leadId, lead.source_contacts, {
        name: bestCt.name,
        title: bestCt.title,
        organization: mergedOrg,
        phone: mergedPhone,
        email: mergedEmail,
        address: bestCt.address ?? matchedManual?.facility_address,
        origin: bestCt.origin,
      });
      return writeAndReturn({
        lead_id: leadId,
        status: "found",
        name: bestCt.name,
        title: bestCt.title,
        organization: mergedOrg,
        phone: mergedPhone,
        email: mergedEmail,
        linkedin_url: null,
      });
    }
  }

  // 7b: Named physicians extracted in lead.entities.physicians -> CMS NPPES lookup
  for (const physName of (ents.physicians ?? []).slice(0, 2)) {
    const nppesDoc = await fetchNppesClinicianByName(physName, stateCode);
    if (nppesDoc) {
      await persistSourceContactIfEmpty(leadId, lead.source_contacts, {
        name: nppesDoc.name,
        title: nppesDoc.title,
        organization: org ?? nppesDoc.organization,
        phone: nppesDoc.phone,
        email: nppesDoc.email,
        address: nppesDoc.address,
        origin: nppesDoc.origin,
      });
      return writeAndReturn({
        lead_id: leadId,
        status: "found",
        name: nppesDoc.name,
        title: nppesDoc.title,
        organization: org ?? nppesDoc.organization,
        phone: nppesDoc.phone,
        email: nppesDoc.email,
        linkedin_url: null,
      });
    }
  }

  // 7c: Hospital / Organization lookup via CMS NPPES NPI-2 Authorized Official + NIH RePORTER PIs
  if (org) {
    const [nppesOrg, nihContacts] = await Promise.all([
      fetchNppesOrganizationOfficial(org, stateCode),
      fetchNihReporterContacts({ organizationName: org, stateCode, limit: 3 }),
    ]);
    const candidate = nppesOrg ?? nihContacts[0] ?? null;
    if (candidate) {
      const mergedPhone =
        candidate.phone ?? matchedManual?.direct_phone ?? matchedManual?.department_phone ?? null;
      const mergedEmail = candidate.email ?? matchedManual?.email ?? null;
      await persistSourceContactIfEmpty(leadId, lead.source_contacts, {
        name: candidate.name,
        title: candidate.title,
        organization: candidate.organization ?? org,
        phone: mergedPhone,
        email: mergedEmail,
        address: candidate.address ?? matchedManual?.facility_address,
        origin: candidate.origin,
      });
      return writeAndReturn({
        lead_id: leadId,
        status: "found",
        name: candidate.name,
        title: candidate.title,
        organization: candidate.organization ?? org,
        phone: mergedPhone,
        email: mergedEmail,
        linkedin_url: null,
      });
    }
  }

  // 7d: Territory specialty / recall fallback (for statewide/nationwide FDA recalls or unnamed accounts)
  const namedManuals = manualList.filter(
    (c) => c.contact_name && (c.direct_phone || c.department_phone || c.email),
  );
  const specialtyText = `${lead.specialty ?? ""} ${lead.title ?? ""}`.toLowerCase();
  const preferredManual =
    namedManuals.find((c) => {
      const t = `${c.title ?? ""} ${c.account_name}`.toLowerCase();
      if (specialtyText.includes("cardio") || specialtyText.includes("monitor")) {
        return t.includes("em") || t.includes("imaging") || t.includes("ultrasound");
      }
      if (
        specialtyText.includes("radiol") ||
        specialtyText.includes("imaging") ||
        specialtyText.includes("alphenix")
      ) {
        return t.includes("imaging") || t.includes("ultrasound");
      }
      return true;
    }) ?? namedManuals[0];

  if (preferredManual?.contact_name) {
    const phone = preferredManual.direct_phone ?? preferredManual.department_phone;
    await persistSourceContactIfEmpty(leadId, lead.source_contacts, {
      name: preferredManual.contact_name,
      title: `${preferredManual.title ?? "Clinical Director"} (Territory Account)`,
      organization: preferredManual.account_name,
      phone,
      email: preferredManual.email,
      address: preferredManual.facility_address,
      origin: "Territory Directory",
    });
    return writeAndReturn({
      lead_id: leadId,
      status: "found",
      name: preferredManual.contact_name,
      title: `${preferredManual.title ?? "Clinical Director"} (Territory Account)`,
      organization: preferredManual.account_name,
      phone,
      email: preferredManual.email,
      linkedin_url: null,
    });
  }

  const specialists = await prospectNppesSpecialists({ stateCode, limit: 1 });
  if (specialists[0]) {
    const sp = specialists[0];
    await persistSourceContactIfEmpty(leadId, lead.source_contacts, {
      name: sp.name,
      title: sp.title,
      organization: sp.organization,
      phone: sp.phone,
      email: sp.email,
      address: sp.address,
      origin: sp.origin,
    });
    return writeAndReturn({
      lead_id: leadId,
      status: "found",
      name: sp.name,
      title: sp.title,
      organization: sp.organization,
      phone: sp.phone,
      email: sp.email,
      linkedin_url: null,
    });
  }

  return writeAndReturn({
    lead_id: leadId,
    status: "none",
    name: null,
    title: null,
    organization: org,
    phone: null,
    email: null,
    linkedin_url: null,
  });
}

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

    const toProcess = (leads ?? []).filter((l) => !foundSet.has(l.id)).slice(0, limit);

    let enriched = 0;
    let errors = 0;
    for (const lead of toProcess) {
      try {
        const result = await runContactWaterfall(lead.id);
        if (result.status === "found") enriched++;
      } catch (e) {
        errors++;
        logWarn("contacts.batch", "Batch contact enrichment failed for lead", {
          leadId: lead.id,
          error: e instanceof Error ? e.message : String(e),
        });
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
  const ids = new Set([...(enrichRes.data ?? []).map((r) => r.lead_id), ...physIds]);
  return { count: ids.size };
});
