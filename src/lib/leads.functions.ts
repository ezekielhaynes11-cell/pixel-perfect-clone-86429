import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runIngestion } from "./ingest/run.server";
import { draftOutreachEmail } from "./outreach.server";
import { generateDailyBriefing, type BriefingLead } from "./briefings.server";

export const listLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("enriched", true)
      .order("confidence", { ascending: false })
      .order("date_discovered", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const triggerIngestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return await runIngestion(context.userId);
  });

export const listLeadActions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("lead_actions")
      .select("lead_id, action, note, created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const setLeadAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.remove) {
      await supabase
        .from("lead_actions")
        .delete()
        .eq("lead_id", data.lead_id)
        .eq("user_id", userId)
        .eq("action", data.action);
      return { ok: true };
    }
    const { error } = await supabase.from("lead_actions").insert({
      lead_id: data.lead_id,
      user_id: userId,
      action: data.action,
      note: data.note ?? null,
    });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Outreach drafts -------------------- */

export const listDraftsForLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("outreach_drafts")
      .select("*")
      .eq("lead_id", data.lead_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const generateOutreachDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        lead_id: z.string().uuid(),
        tone: z.enum(["discovery", "follow_up", "executive_intro"]).default("discovery"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", data.lead_id)
      .single();
    if (error || !lead) throw new Error("Lead not found");

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const draft = await draftOutreachEmail({
      lead: {
        title: lead.title,
        summary: lead.summary ?? "",
        hospital: lead.hospital,
        specialty: lead.specialty,
        entities: (lead.entities as {
          physicians?: string[];
          equipment?: string[];
          keywords?: string[];
        }) ?? {},
      },
      repName: profile?.display_name ?? "Your Philips rep",
      tone: data.tone,
    });

    const { data: saved, error: insErr } = await supabase
      .from("outreach_drafts")
      .insert({
        lead_id: data.lead_id,
        user_id: userId,
        subject: draft.subject,
        body: draft.body,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);
    return saved;
  });

export const updateOutreachDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(8000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("outreach_drafts")
      .update({ subject: data.subject, body: data.body })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Saved searches -------------------- */

const FilterSchema = z.object({
  hospitals: z.array(z.string()).default([]),
  specialties: z.array(z.string()).default([]),
  sources: z.array(z.string()).default([]),
  minConfidence: z.number().min(0).max(100).default(0),
});

export const listSavedSearches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("saved_searches")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertSavedSearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { error } = await supabase
        .from("saved_searches")
        .update({
          name: data.name,
          filter: data.filter,
          alert_threshold: data.alert_threshold,
          alerts_enabled: data.alerts_enabled,
        })
        .eq("id", data.id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabase
      .from("saved_searches")
      .insert({
        user_id: userId,
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("saved_searches")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Alerts -------------------- */

export const listAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("alerts")
      .select("id, lead_id, created_at, read_at, saved_search_id")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markAlertRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", userId);
    return { ok: true };
  });

export const markAllAlertsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("alerts")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    return { ok: true };
  });

/* -------------------- Pipeline forecast -------------------- */

export const getPipelineForecast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [leadsRes, actionsRes] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, title, hospital, specialty, confidence, estimated_value_usd, win_probability, date_discovered, source",
        )
        .eq("enriched", true)
        .gte("confidence", 60)
        .limit(500),
      supabase.from("lead_actions").select("lead_id, action").eq("user_id", userId),
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

export const getOrCreateDailyBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("briefings")
      .select("*")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();
    if (existing) return existing;

    const { data: leads } = await supabase
      .from("leads")
      .select("id, title, summary, hospital, specialty, confidence, estimated_value_usd, win_probability")
      .eq("enriched", true)
      .order("confidence", { ascending: false })
      .limit(5);
    const top = (leads ?? []) as Array<BriefingLead & { id: string }>;
    if (top.length === 0) {
      return {
        date: today,
        markdown: "_No enriched leads yet today. Hit **Refresh feed** to pull fresh signals from SAM.gov, FDA and news._",
        top_lead_ids: [] as string[],
      };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();

    const markdown = await generateDailyBriefing(profile?.display_name ?? "rep", top);

    const { data: saved } = await supabase
      .from("briefings")
      .insert({
        user_id: userId,
        date: today,
        markdown,
        top_lead_ids: top.map((l) => l.id),
      })
      .select()
      .single();
    return saved;
  });

/* -------------------- Ingestion runs -------------------- */

export const getRecentIngestionRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("ingestion_runs")
      .select("source, started_at, finished_at, status, fetched_count, new_count, enriched_count")
      .order("started_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
