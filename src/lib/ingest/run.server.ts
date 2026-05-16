import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchGdelt } from "./gdelt.server";
import { fetchOpenFda } from "./openfda.server";
import { fetchSamGov } from "./sam-gov.server";
import { fetchClinicalTrials } from "./clinicaltrials.server";
import { fetchCmsOpenPayments } from "./cms-open-payments.server";
import { enrichRawLead } from "./enrich.server";
import type { RawLead } from "./types";

export interface IngestionSummary {
  source: string;
  fetched: number;
  inserted: number;
  enriched: number;
  error?: string;
}

interface SavedSearchFilter {
  hospitals?: string[];
  specialties?: string[];
  sources?: string[];
  minConfidence?: number;
}

export async function runIngestion(forUserId?: string): Promise<IngestionSummary[]> {
  const samKey = process.env.SAM_GOV_API_KEY;
  const summaries: IngestionSummary[] = [];
  const newlyEnrichedIds: string[] = [];

  const sources: Array<{ name: string; fn: () => Promise<RawLead[]> }> = [
    {
      name: "sam_gov",
      fn: () => (samKey ? fetchSamGov({ apiKey: samKey }) : Promise.resolve([])),
    },
    { name: "openfda", fn: () => fetchOpenFda({}) },
    { name: "gdelt", fn: () => fetchGdelt({}) },
    { name: "clinicaltrials", fn: () => fetchClinicalTrials({}) },
    { name: "cms_open_payments", fn: () => fetchCmsOpenPayments({ territoryState: "CA" }) },
  ];

  for (const src of sources) {
    const runRow = await supabaseAdmin
      .from("ingestion_runs")
      .insert({ source: src.name })
      .select()
      .single();
    const runId = runRow.data?.id;

    try {
      const raws = await src.fn();
      const inserted = await persistRaws(raws);
      const enrichedIds = await enrichPending(src.name);
      newlyEnrichedIds.push(...enrichedIds);

      summaries.push({
        source: src.name,
        fetched: raws.length,
        inserted,
        enriched: enrichedIds.length,
      });

      if (runId) {
        await supabaseAdmin
          .from("ingestion_runs")
          .update({
            finished_at: new Date().toISOString(),
            fetched_count: raws.length,
            new_count: inserted,
            enriched_count: enrichedIds.length,
            status: "ok",
          })
          .eq("id", runId);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Ingestion failed for ${src.name}:`, msg);
      summaries.push({ source: src.name, fetched: 0, inserted: 0, enriched: 0, error: msg });
      if (runId) {
        await supabaseAdmin
          .from("ingestion_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: "error",
            error: msg,
          })
          .eq("id", runId);
      }
    }
  }

  // Evaluate saved-search alerts against newly enriched leads.
  if (newlyEnrichedIds.length > 0) {
    try {
      await evaluateAlerts(newlyEnrichedIds, forUserId);
    } catch (e) {
      console.error("alerts evaluation failed:", e);
    }
  }

  return summaries;
}

async function persistRaws(raws: RawLead[]): Promise<number> {
  if (raws.length === 0) return 0;
  let inserted = 0;
  for (const r of raws) {
    const { error } = await supabaseAdmin.from("leads").insert({
      source: r.source,
      source_external_id: r.source_external_id,
      source_url: r.source_url,
      title: r.title.slice(0, 500),
      summary: r.raw_text.slice(0, 600),
      raw_payload: r.raw_payload as never,
      date_discovered: r.date_discovered,
      confidence: 0,
      enriched: false,
    });
    if (!error) inserted++;
    else if (!error.message?.includes("duplicate")) console.error("insert lead:", error.message);
  }
  return inserted;
}

async function enrichPending(source: string): Promise<string[]> {
  const { data: pending } = await supabaseAdmin
    .from("leads")
    .select("id, source, source_external_id, source_url, title, summary, raw_payload, date_discovered")
    .eq("source", source)
    .eq("enriched", false)
    .order("date_discovered", { ascending: false })
    .limit(20);

  if (!pending || pending.length === 0) return [];

  const ids: string[] = [];
  for (const row of pending) {
    try {
      const raw: RawLead = {
        source: row.source as RawLead["source"],
        source_external_id: row.source_external_id,
        source_url: row.source_url ?? "",
        title: row.title,
        raw_text: row.summary ?? row.title,
        date_discovered: row.date_discovered,
        raw_payload: (row.raw_payload as Record<string, unknown>) ?? {},
      };
      const enriched = await enrichRawLead(raw);
      await supabaseAdmin
        .from("leads")
        .update({
          summary: enriched.summary,
          confidence: enriched.confidence,
          priority: enriched.priority,
          hospital: enriched.hospital,
          specialty: enriched.specialty,
          territory: enriched.territory,
          entities: enriched.entities as never,
          estimated_value_usd: enriched.estimated_value_usd,
          win_probability: enriched.win_probability,
          competitor_incumbent: enriched.competitor_incumbent,
          enriched: true,
        })
        .eq("id", row.id);
      ids.push(row.id);
    } catch (e) {
      console.error("enrich failed:", e instanceof Error ? e.message : e);
    }
  }
  return ids;
}

async function evaluateAlerts(newLeadIds: string[], forUserId?: string) {
  // Fetch the newly enriched leads
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, hospital, specialty, source, confidence")
    .in("id", newLeadIds);
  if (!leads || leads.length === 0) return;

  // Fetch active saved searches (optionally scoped to the user who triggered)
  let q = supabaseAdmin
    .from("saved_searches")
    .select("id, user_id, filter, alert_threshold, alerts_enabled")
    .eq("alerts_enabled", true);
  if (forUserId) q = q.eq("user_id", forUserId);
  const { data: searches } = await q;
  if (!searches || searches.length === 0) return;

  const toInsert: Array<{ lead_id: string; user_id: string; saved_search_id: string }> = [];
  for (const s of searches) {
    const f = (s.filter as SavedSearchFilter) ?? {};
    for (const l of leads) {
      if (l.confidence < s.alert_threshold) continue;
      if (f.hospitals?.length && (!l.hospital || !f.hospitals.includes(l.hospital))) continue;
      if (f.specialties?.length && (!l.specialty || !f.specialties.includes(l.specialty))) continue;
      if (f.sources?.length && !f.sources.includes(l.source)) continue;
      if (f.minConfidence && l.confidence < f.minConfidence) continue;
      toInsert.push({ lead_id: l.id, user_id: s.user_id, saved_search_id: s.id });
    }
  }
  if (toInsert.length === 0) return;
  await supabaseAdmin.from("alerts").insert(toInsert);
}
