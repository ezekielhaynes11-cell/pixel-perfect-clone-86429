import { z } from "zod";
import { logWarn } from "../logger.server";
import { deterministicEnrichRawLead } from "./deterministic-enrich.server";
import { loadKeywords } from "./keywords.server";
import { sanitizeErrorText } from "./medical-gate";
import type { EnrichmentResult, RawLead } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GATEWAY_TIMEOUT_MS = 12_000;

const BASE_SYSTEM = `You are a senior sales intelligence analyst for Philips Medical (medical imaging, patient monitoring, cardiac, respiratory). You evaluate raw signals and produce structured leads for field reps covering Texas, Oklahoma, Arkansas, and Louisiana.

Confidence rubric (0-100):
- 92-98: Explicit RFQ / RFP / federal contract award at a named hospital or VA facility
- 85-91: Class I or Class II FDA recall on competitor imaging/monitoring/cardiac/respiratory equipment (including nationwide US recalls that impact TX/OK/AR/LA hospitals), or federal hospital grant/capital award >= $200k at a named TX/OK/AR/LA institution
- 72-84: Active clinical trial, hospital expansion, or new fellowship/imaging program at a named TX/OK/AR/LA hospital
- 60-71: Practitioner forum discussion mentioning vendor or equipment frustration (Reddit/Bluesky chatter)
- Below 60: Weak signal, low specificity

Priority: high (>=85, or >=70 with recall/rfp/funding signal and >=$250k pipeline value), medium (65-84), low (<65).

Estimated value: realistic USD pipeline value for Philips if won. Ultrasound RFQ $400k-$1.2M; cath lab $1.5M-$4M; MRI $1.5M-$3M; ventilator fleet $300k-$1.5M; infusion pump replacement $200k-$800k; ECMO $250k-$600k per unit.

Win probability: 0.0-1.0. Recall replacement = 0.45; explicit RFQ Philips invited = 0.4; RFQ generic = 0.2; news of expansion = 0.15; sentiment chatter = 0.05; vendor M&A disruption = 0.25.

Territory: infer US state slug (e.g. "texas", "oklahoma", "arkansas", "louisiana") from any geographic signal.

account_type: "va" if the hospital is a VA / Veterans Affairs facility, "non_va" if clearly civilian, "unknown" otherwise.

signal_type: pick ONE — recall (FDA recall), rfp (solicitation/RFQ/RFP), funding (grant/budget/capital), expansion (new wing/program/fellowship), sentiment (forum complaint/discussion), m_and_a (vendor merger/acquisition/EOL/manufacturing change), incumbency (known competitor installed), other.

vendor_mentions: extract competitor vendor names AND specific product models mentioned (e.g. "GE Venue Fit", "Mindray TE7", "SonoSite LX"). Empty array if none.

For each physician name extracted, include a role_hint when inferable (e.g. "POCUS director", "fellowship director", "chief of emergency medicine", "biomed", "attending"). Leave role_hint null if unknown.

Output ONLY valid JSON via the structured tool. Be conservative with confidence — never inflate.`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "extract_lead",
    description: "Extract structured Philips Medical sales lead intelligence.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "<=280 char sales-rep voice summary" },
        confidence: { type: "integer", minimum: 0, maximum: 100 },
        priority: { type: "string", enum: ["high", "medium", "low"] },
        hospital: { type: ["string", "null"] },
        specialty: {
          type: ["string", "null"],
          description:
            "One of: Cardiology, Radiology, Pulmonology, Critical Care, Anesthesia, Oncology, Emergency, Surgery, OB/GYN, Other",
        },
        territory: { type: ["string", "null"], description: "US state slug or null" },
        estimated_value_usd: { type: ["number", "null"] },
        win_probability: { type: ["number", "null"], minimum: 0, maximum: 1 },
        competitor_incumbent: { type: ["string", "null"] },
        account_type: { type: "string", enum: ["va", "non_va", "unknown"] },
        signal_type: {
          type: "string",
          enum: [
            "recall",
            "rfp",
            "funding",
            "expansion",
            "sentiment",
            "m_and_a",
            "incumbency",
            "other",
          ],
        },
        vendor_mentions: { type: "array", items: { type: "string" } },
        entities: {
          type: "object",
          properties: {
            hospitals: { type: "array", items: { type: "string" } },
            physicians: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role_hint: { type: ["string", "null"] },
                },
                required: ["name", "role_hint"],
                additionalProperties: false,
              },
            },
            equipment: { type: "array", items: { type: "string" } },
            keywords: { type: "array", items: { type: "string" } },
          },
          required: ["hospitals", "physicians", "equipment", "keywords"],
          additionalProperties: false,
        },
      },
      required: [
        "summary",
        "confidence",
        "priority",
        "hospital",
        "specialty",
        "territory",
        "estimated_value_usd",
        "win_probability",
        "competitor_incumbent",
        "account_type",
        "signal_type",
        "vendor_mentions",
        "entities",
      ],
      additionalProperties: false,
    },
  },
};

const gatewayEnvelopeSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            tool_calls: z
              .array(
                z.object({
                  function: z.object({ arguments: z.string().optional() }).optional(),
                }),
              )
              .optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

const physicianEntitySchema = z.union([
  z.string().transform((name) => ({ name, role_hint: null as string | null })),
  z.object({
    name: z.string(),
    role_hint: z.string().nullable().optional().default(null),
  }),
]);

const enrichmentResultSchema = z.object({
  summary: z.string(),
  confidence: z.number(),
  priority: z.enum(["high", "medium", "low"]),
  hospital: z.string().nullable(),
  specialty: z.string().nullable(),
  territory: z.string().nullable(),
  estimated_value_usd: z.number().nullable(),
  win_probability: z.number().nullable(),
  competitor_incumbent: z.string().nullable(),
  account_type: z.enum(["va", "non_va", "unknown"]),
  signal_type: z.enum([
    "recall",
    "rfp",
    "funding",
    "expansion",
    "sentiment",
    "m_and_a",
    "incumbency",
    "other",
  ]),
  vendor_mentions: z.array(z.string()).default([]),
  entities: z
    .object({
      hospitals: z.array(z.string()).default([]),
      physicians: z.array(physicianEntitySchema).default([]),
      equipment: z.array(z.string()).default([]),
      keywords: z.array(z.string()).default([]),
    })
    .default({ hospitals: [], physicians: [], equipment: [], keywords: [] }),
});

function normalizeEnrichmentResult(parsed: EnrichmentResult): EnrichmentResult {
  const confidence = Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 0)));
  const isHighPriority =
    confidence >= 85 ||
    (confidence >= 70 &&
      ["recall", "rfp", "funding"].includes(parsed.signal_type) &&
      (parsed.estimated_value_usd ?? 0) >= 250_000);

  return {
    ...parsed,
    confidence,
    priority: isHighPriority ? "high" : parsed.priority,
    win_probability:
      parsed.win_probability != null ? Math.max(0, Math.min(1, parsed.win_probability)) : null,
  };
}

export async function enrichRawLead(raw: RawLead): Promise<EnrichmentResult> {
  let vendors: string[] = [];
  let products: string[] = [];
  let focusConcepts: string[] = [];
  try {
    const keywordLists = await loadKeywords();
    vendors = keywordLists.vendors;
    products = keywordLists.products;
    focusConcepts = keywordLists.focusConcepts;
  } catch (err) {
    logWarn("ingest.enrich", "Keyword table unavailable during enrichment; using built-in lists", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const apiKey = process.env.LOVABLE_API_KEY?.trim();
  if (!apiKey) {
    return deterministicEnrichRawLead(raw, vendors, products);
  }

  const hintBlock = `Known vendors of interest: ${vendors.join(", ")}
Known product models: ${products.join(", ")}
Focus concepts: ${focusConcepts.join(", ")}`;

  const userMsg = `Source: ${raw.source}
Discovered: ${raw.date_discovered}
URL: ${raw.source_url}

${hintBlock}

${raw.raw_text}`;

  try {
    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: BASE_SYSTEM },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "extract_lead" } },
      }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });

    if (!response.ok) {
      const bodyText = sanitizeErrorText(await response.text(), 180);
      logWarn(
        "ingest.enrich",
        "AI gateway returned non-2xx; falling back to deterministic clinical enrichment",
        { source: raw.source, status: response.status, detail: bodyText },
      );
      return deterministicEnrichRawLead(raw, vendors, products);
    }

    const envelope = gatewayEnvelopeSchema.parse(await response.json());
    const argsStr = envelope.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!argsStr) {
      logWarn(
        "ingest.enrich",
        "AI gateway omitted tool call; falling back to deterministic clinical enrichment",
        { source: raw.source },
      );
      return deterministicEnrichRawLead(raw, vendors, products);
    }

    const parsed = enrichmentResultSchema.parse(JSON.parse(argsStr));
    return normalizeEnrichmentResult(parsed);
  } catch (err) {
    logWarn(
      "ingest.enrich",
      "AI gateway call failed; falling back to deterministic clinical enrichment",
      { source: raw.source, error: err instanceof Error ? err.message : String(err) },
    );
    return deterministicEnrichRawLead(raw, vendors, products);
  }
}
