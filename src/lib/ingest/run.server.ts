import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchGdelt } from "./gdelt.server";
import { fetchOpenFda } from "./openfda.server";
import { fetchSamGov } from "./sam-gov.server";
import { enrichRawLead } from "./enrich.server";
import type { RawLead } from "./types";

export interface IngestionSummary {
  source: string;
  fetched: number;
  inserted: number;
  enriched: number;
  error?: string;
}

export async function runIngestion(): Promise<IngestionSummary[]> {
  const samKey = process.env.SAM_GOV_API_KEY;
  const summaries: IngestionSummary[] = [];

  // Each source is isolated so one failure doesn't kill the run
  const sources: Array<{ name: string; fn: () => Promise<RawLead[]> }> = [
    {
      name: "sam_gov",
      fn: () => (samKey ? fetchSamGov({ apiKey: samKey }) : Promise.resolve([])),
    },
    { name: "openfda", fn: () => fetchOpenFda({}) },
    { name: "gdelt", fn: () => fetchGdelt({}) },
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
      const enrichedCount = await enrichPending(src.name);

      summaries.push({
        source: src.name,
        fetched: raws.length,
        inserted,
        enriched: enrichedCount,
      });

      if (runId) {
        await supabaseAdmin
          .from("ingestion_runs")
          .update({
            finished_at: new Date().toISOString(),
            fetched_count: raws.length,
            new_count: inserted,
            enriched_count: enrichedCount,
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

  return summaries;
}

async function persistRaws(raws: RawLead[]): Promise<number> {
  if (raws.length === 0) return 0;
  let inserted = 0;
  // Insert one at a time so dedupe conflicts don't roll back the batch.
  for (const r of raws) {
    const { error } = await supabaseAdmin
      .from("leads")
      .insert({
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

async function enrichPending(source: string): Promise<number> {
  const { data: pending } = await supabaseAdmin
    .from("leads")
    .select("id, source, source_external_id, source_url, title, summary, raw_payload, date_discovered")
    .eq("source", source)
    .eq("enriched", false)
    .order("date_discovered", { ascending: false })
    .limit(20); // cap per run to control cost

  if (!pending || pending.length === 0) return 0;

  let count = 0;
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
      count++;
    } catch (e) {
      console.error("enrich failed:", e instanceof Error ? e.message : e);
    }
  }
  return count;
}
