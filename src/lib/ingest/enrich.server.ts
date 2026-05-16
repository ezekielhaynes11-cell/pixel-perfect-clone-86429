import type { EnrichmentResult, RawLead } from "./types";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

const SYSTEM_PROMPT = `You are a senior sales intelligence analyst for Phillips Medical (medical imaging, patient monitoring, cardiac, respiratory, and surgical equipment). You evaluate raw signals and produce structured leads for field sales reps.

Confidence rubric (0-100):
- 95+: Explicit RFQ / RFP / solicitation with budget or deadline at a named US hospital
- 90-94: FDA recall affecting a competitor at named accounts — replacement opportunity
- 85-89: Publicly announced capital budget, new program, expansion, or grant
- 70-84: News article about hospital expansion / fellowship / leadership change
- 60-69: Practitioner forum discussion mentioning vendor or equipment frustration
- Below 60: Weak signal, low specificity

Priority: high (>=85), medium (70-84), low (<70).

Estimated value: realistic USD pipeline value for Phillips if won. Ultrasound RFQ $400k-$1.2M; cath lab $1.5M-$4M; MRI $1.5M-$3M; ventilator fleet $300k-$1.5M; infusion pump replacement $200k-$800k; ECMO $250k-$600k per unit.

Win probability: 0.0-1.0. Recall replacement = 0.45; explicit RFQ Phillips invited = 0.4; RFQ generic = 0.2; news of expansion = 0.15; sentiment chatter = 0.05.

Territory: infer US state slug (e.g. "texas", "oklahoma", "arkansas", "louisiana") from any geographic signal.

Output ONLY valid JSON via the structured tool. Be conservative with confidence — never inflate.`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "extract_lead",
    description: "Extract structured Phillips Medical sales lead intelligence.",
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
        entities: {
          type: "object",
          properties: {
            hospitals: { type: "array", items: { type: "string" } },
            physicians: { type: "array", items: { type: "string" } },
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
        "entities",
      ],
      additionalProperties: false,
    },
  },
};

export async function enrichRawLead(raw: RawLead): Promise<EnrichmentResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const userMsg = `Source: ${raw.source}\nDiscovered: ${raw.date_discovered}\nURL: ${raw.source_url}\n\n${raw.raw_text}`;

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "function", function: { name: "extract_lead" } },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway ${res.status}: ${body}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!argsStr) throw new Error("AI gateway returned no tool call");
  const parsed = JSON.parse(argsStr) as EnrichmentResult;

  // Sanity clamps
  parsed.confidence = Math.max(0, Math.min(100, Math.round(parsed.confidence ?? 0)));
  if (parsed.win_probability != null) {
    parsed.win_probability = Math.max(0, Math.min(1, parsed.win_probability));
  }
  return parsed;
}
