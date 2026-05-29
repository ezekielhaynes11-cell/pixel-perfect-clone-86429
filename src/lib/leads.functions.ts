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
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select(LEAD_LIST_COLUMNS)
    .eq("enriched", true)
    .order("confidence", { ascending: false })
    .order("date_discovered", { ascending: false })
    .limit(200);
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
      .eq("enriched", true)
      .gte("confidence", 60)
      .limit(500),
    supabaseAdmin.from("lead_actions").select("lead_id, action").eq("user_id", OWNER_ID),
  ]);
  if (leadsRes.error) throw new Error(leadsRes.error.message);

  const dismissed = new Set(
    (actionsRes.data ?? []).filter((a) => a.action === "dismissed").map((a) => a.lead_id),
  );
  const open = (leadsRes.data ?? []).filter((l) => !dismissed.has(l.id));

  const weighted = (l: (typeof open)[number]) =>
    (Number(l.estimated_value_usd) || 0) * (Number(l.win_probability) || 0);

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
    const h = l.hospital ?? "Unknown";
    byHospital[h] = (byHospital[h] ?? 0) + weighted(l);
    const wk = new Date(l.date_discovered);
    wk.setUTCDate(wk.getUTCDate() - wk.getUTCDay());
    const wkKey = wk.toISOString().slice(0, 10);
    byWeek[wkKey] = (byWeek[wkKey] ?? 0) + weighted(l);
  }

  const topLeads = open
    .map((l) => ({ ...l, weighted: weighted(l) }))
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

