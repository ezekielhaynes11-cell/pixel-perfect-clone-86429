import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchGdelt } from "./gdelt.server";
import { fetchOpenFda } from "./openfda.server";
import { fetchSamGov } from "./sam-gov.server";
import { fetchClinicalTrials } from "./clinicaltrials.server";
import { fetchCmsOpenPayments } from "./cms-open-payments.server";
import { fetchReddit } from "./reddit.server";
import { fetchBluesky } from "./bluesky.server";
import { fetchFundingRss } from "./funding-rss.server";
import { enrichRawLead } from "./enrich.server";
import { attachPhysiciansToLead, type PhysicianLookupInput } from "./nppes.server";
import { backfillApolloForLinkedPhysicians } from "@/lib/apollo/service.server";
import type { LeadSource, RawLead } from "./types";

// Map US state name → 2-letter code for NPPES name lookups
const STATE_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY",
};

// Heuristic: filter out Reddit usernames (junk names that won't match NPPES).
function looksLikeRedditUsername(name: string): boolean {
  const n = name.trim();
  if (n.length < 4) return true;
  if (n.startsWith("u/") || n.startsWith("/u/")) return true;
  if (n.includes("_") || n.includes("-")) return true;
  if (!n.includes(" ")) {
    // Single token: very likely a handle, especially if it has digits
    if (/\d/.test(n)) return true;
    return true;
  }
  return false;
}


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
  states?: string[];
  accountTypes?: string[];
  signalTypes?: string[];
  vendors?: string[];
  minConfidence?: number;
}

type SourceSpec = { name: string; sourceFilter: LeadSource[]; fn: () => Promise<RawLead[]> };

function buildSources(): SourceSpec[] {
  const samKey = process.env.SAM_GOV_API_KEY;
  // fetchGdelt produces three different `source` values internally
  // (gdelt / gdelt_m_and_a / gdelt_va_funding). Treat the call as a single
  // ingestion-run entry but bucket inserts by their own source for clarity.
  return [
    { name: "sam_gov", sourceFilter: ["sam_gov"], fn: () => (samKey ? fetchSamGov({ apiKey: samKey }) : Promise.resolve([])) },
    { name: "openfda", sourceFilter: ["openfda"], fn: () => fetchOpenFda({}) },
    { name: "gdelt", sourceFilter: ["gdelt", "gdelt_m_and_a", "gdelt_va_funding"], fn: () => fetchGdelt({}) },
    { name: "clinicaltrials", sourceFilter: ["clinicaltrials"], fn: () => fetchClinicalTrials({}) },
    { name: "reddit", sourceFilter: ["reddit"], fn: () => fetchReddit({}) },
    { name: "bluesky", sourceFilter: ["bluesky"], fn: () => fetchBluesky({}) },
    { name: "funding_rss", sourceFilter: ["funding_rss"], fn: () => fetchFundingRss() },
    {
      name: "cms_open_payments",
      sourceFilter: ["cms_open_payments"],
      fn: async () => {
        const states = ["OK", "AR", "LA", "TX"];
        const all: RawLead[] = [];
        for (const s of states) {
          try {
            const rows = await fetchCmsOpenPayments({ territoryState: s });
            all.push(...rows);
          } catch (e) {
            console.error(`cms_open_payments ${s} failed:`, e instanceof Error ? e.message : e);
          }
        }
        return all;
      },
    },
  ];
}

export const INGESTION_SOURCE_NAMES = [
  "sam_gov", "openfda", "gdelt", "clinicaltrials",
  "reddit", "bluesky", "funding_rss", "cms_open_payments",
] as const;
export type IngestionSourceName = (typeof INGESTION_SOURCE_NAMES)[number];

async function runOneSource(src: SourceSpec): Promise<{ summary: IngestionSummary; enrichedIds: string[] }> {
  const runRow = await supabaseAdmin.from("ingestion_runs").insert({ source: src.name }).select().single();
  const runId = runRow.data?.id;
  const enrichedIds: string[] = [];
  try {
    const raws = await src.fn();
    const inserted = await persistRaws(raws);
    let enrichedTotal = 0;
    for (const s of src.sourceFilter) {
      const ids = await enrichPending(s);
      enrichedIds.push(...ids);
      enrichedTotal += ids.length;
    }
    if (runId) {
      await supabaseAdmin.from("ingestion_runs").update({
        finished_at: new Date().toISOString(),
        fetched_count: raws.length,
        new_count: inserted,
        enriched_count: enrichedTotal,
        status: "ok",
      }).eq("id", runId);
    }
    return { summary: { source: src.name, fetched: raws.length, inserted, enriched: enrichedTotal }, enrichedIds };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Ingestion failed for ${src.name}:`, msg);
    if (runId) {
      await supabaseAdmin.from("ingestion_runs").update({
        finished_at: new Date().toISOString(), status: "error", error: msg,
      }).eq("id", runId);
    }
    return { summary: { source: src.name, fetched: 0, inserted: 0, enriched: 0, error: msg }, enrichedIds };
  }
}

export async function runIngestionForSource(
  name: IngestionSourceName,
  forUserId?: string,
): Promise<IngestionSummary> {
  const src = buildSources().find((s) => s.name === name);
  if (!src) throw new Error(`Unknown ingestion source: ${name}`);
  const { summary, enrichedIds } = await runOneSource(src);
  if (enrichedIds.length > 0) {
    try { await evaluateAlerts(enrichedIds, forUserId); }
    catch (e) { console.error("alerts evaluation failed:", e); }
  }
  try { await backfillApolloForLinkedPhysicians({ limit: 25 }); }
  catch (e) { console.error("apollo backfill failed:", e); }
  return summary;
}

export async function runIngestion(forUserId?: string): Promise<IngestionSummary[]> {
  const sources = buildSources();
  const summaries: IngestionSummary[] = [];
  const newlyEnrichedIds: string[] = [];
  for (const src of sources) {
    const { summary, enrichedIds } = await runOneSource(src);
    summaries.push(summary);
    newlyEnrichedIds.push(...enrichedIds);
  }
  if (newlyEnrichedIds.length > 0) {
    try { await evaluateAlerts(newlyEnrichedIds, forUserId); }
    catch (e) { console.error("alerts evaluation failed:", e); }
  }
  try { await backfillApolloForLinkedPhysicians({ limit: 50 }); }
  catch (e) { console.error("apollo backfill failed:", e); }
  return summaries;
}

// Sources that are domain-pure (medical/healthcare by construction) bypass the gate.
const GATE_BYPASS_SOURCES = new Set<string>([
  "openfda",
  "clinicaltrials",
  "cms_open_payments",
]);

// Hard pre-enrichment gate: only let through items with explicit
// medical / healthcare / hospital terminology. Prevents pop-culture and
// general-news noise (esp. from GDELT/Reddit/Bluesky/SAM.gov) from being
// inserted into leads or sent to the LLM for enrichment.
const MEDICAL_GATE_TERMS = [
  "ultrasound", "pocus", "echocard", "sonograph", "doppler",
  "cath lab", "catheterization", "radiolog", "cardiolog", "oncolog",
  "emergency medicine", "anesthesi", "surgical", "surgery",
  "hospital", "health system", "healthcare", "health care",
  "medical center", "clinic", "physician", "nurse", "patient",
  "va medical", "va healthcare", "veterans health",
  "imaging", "mri", "ct scan", "x-ray", "biomed",
  "medtech", "medical device", "fda", "clinical trial",
  "icu", "ed ", "ehr", "emr",
];

function passesMedicalGate(r: RawLead, extraTerms: string[]): boolean {
  if (GATE_BYPASS_SOURCES.has(r.source)) return true;
  const hay = `${r.title} ${r.raw_text} ${r.source_url ?? ""}`.toLowerCase();
  if (MEDICAL_GATE_TERMS.some((t) => hay.includes(t))) return true;
  return extraTerms.some((t) => t && hay.includes(t.toLowerCase()));
}

async function persistRaws(raws: RawLead[]): Promise<number> {
  if (raws.length === 0) return 0;
  // Load active vendor/product/focus terms to extend the gate with project-specific signals.
  let extraTerms: string[] = [];
  try {
    const { loadKeywords } = await import("./keywords.server");
    const kw = await loadKeywords();
    extraTerms = kw.all;
  } catch (e) {
    console.error("medical gate: keyword load failed, using built-in terms only:", e instanceof Error ? e.message : e);
  }

  let inserted = 0;
  let gated = 0;
  for (const r of raws) {
    if (!passesMedicalGate(r, extraTerms)) {
      gated++;
      continue;
    }
    const { error } = await supabaseAdmin.from("leads").insert({
      source: r.source,
      source_external_id: r.source_external_id,
      source_url: r.source_url,
      title: r.title.slice(0, 500),
      summary: r.raw_text.slice(0, 600),
      raw_payload: r.raw_payload as never,
      source_contacts: (r.source_contacts ?? null) as never,
      date_discovered: r.date_discovered,
      confidence: 0,
      enriched: false,
    });
    if (!error) inserted++;
    else if (!error.message?.includes("duplicate")) console.error("insert lead:", error.message);
  }
  if (gated > 0) console.log(`[ingest] medical gate dropped ${gated}/${raws.length} non-medical items`);
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

      // Resolve account_id from the enriched hospital name (best-effort).
      let accountId: string | null = null;
      if (enriched.hospital) {
        const { data: existing } = await supabaseAdmin
          .from("accounts").select("id").eq("name", enriched.hospital).maybeSingle();
        if (existing) accountId = existing.id;
        else {
          const { data: created } = await supabaseAdmin.from("accounts").insert({
            name: enriched.hospital,
            state: enriched.territory,
            account_type: enriched.account_type,
            is_va: enriched.account_type === "va",
          }).select("id").maybeSingle();
          accountId = created?.id ?? null;
        }
      }

      // Strip role_hint from entities.physicians before storing (use names only in the jsonb blob
      // to keep the existing UI happy); role_hint goes onto lead_physicians.role_hint.
      const physicianNames = enriched.entities.physicians.map((p) => p.name);
      const entitiesForStorage = {
        hospitals: enriched.entities.hospitals,
        physicians: physicianNames,
        equipment: enriched.entities.equipment,
        keywords: enriched.entities.keywords,
      };

      await supabaseAdmin.from("leads").update({
        summary: enriched.summary,
        confidence: enriched.confidence,
        priority: enriched.priority,
        hospital: enriched.hospital,
        specialty: enriched.specialty,
        territory: enriched.territory,
        entities: entitiesForStorage as never,
        estimated_value_usd: enriched.estimated_value_usd,
        win_probability: enriched.win_probability,
        competitor_incumbent: enriched.competitor_incumbent,
        vendor_mentions: enriched.vendor_mentions,
        account_type: enriched.account_type,
        signal_type: enriched.signal_type,
        account_id: accountId,
        enriched: true,
      }).eq("id", row.id);
      ids.push(row.id);

      try {
        const refs: PhysicianLookupInput[] = [];
        const territory = enriched.territory?.toLowerCase() ?? "";
        const stateCode = STATE_TO_CODE[territory] ?? (territory.length === 2 ? territory.toUpperCase() : null);

        if (source === "cms_open_payments") {
          const payload = raw.raw_payload as { rows?: Array<Record<string, string>> } | undefined;
          const first = payload?.rows?.[0];
          if (first?.Physician_First_Name && first?.Physician_Last_Name) {
            refs.push({
              rawName: `${first.Physician_First_Name} ${first.Physician_Last_Name}`,
              state: first.Recipient_State ?? stateCode,
              role: "cms_payment_recipient",
              roleHint: "cms_payment_recipient",
            });
          }
        }
        for (const phys of enriched.entities.physicians) {
          if (source === "reddit" && looksLikeRedditUsername(phys.name)) continue;
          refs.push({
            rawName: phys.name,
            state: stateCode,
            role: "named_in_source",
            roleHint: phys.role_hint ?? null,
          });
        }
        if (refs.length > 0) await attachPhysiciansToLead(row.id, refs);

      } catch (e) {
        console.error("physician enrichment failed:", e instanceof Error ? e.message : e);
      }
    } catch (e) {
      console.error("enrich failed:", e instanceof Error ? e.message : e);
    }
  }
  return ids;
}

async function evaluateAlerts(newLeadIds: string[], forUserId?: string) {
  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, hospital, specialty, source, confidence, territory, account_type, signal_type, vendor_mentions")
    .in("id", newLeadIds);
  if (!leads || leads.length === 0) return;

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
      if (f.states?.length) {
        const t = (l.territory ?? "").toLowerCase();
        if (!f.states.some((st) => st.toLowerCase() === t)) continue;
      }
      if (f.accountTypes?.length && (!l.account_type || !f.accountTypes.includes(l.account_type))) continue;
      if (f.signalTypes?.length && (!l.signal_type || !f.signalTypes.includes(l.signal_type))) continue;
      if (f.vendors?.length) {
        const vm = (l.vendor_mentions ?? []) as string[];
        if (!vm.some((v) => f.vendors!.includes(v))) continue;
      }
      if (f.minConfidence && l.confidence < f.minConfidence) continue;
      toInsert.push({ lead_id: l.id, user_id: s.user_id, saved_search_id: s.id });
    }
  }
  if (toInsert.length === 0) return;
  await supabaseAdmin.from("alerts").insert(toInsert);
}
