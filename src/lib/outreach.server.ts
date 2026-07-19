const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type OutreachTone = "discovery" | "follow_up" | "executive_intro" | "switch_pitch";

interface DraftInput {
  lead: {
    title: string;
    summary: string;
    hospital: string | null;
    specialty: string | null;
    source?: string | null;
    signal_type?: string | null;
    competitor_incumbent?: string | null;
    vendor_mentions?: string[] | null;
    entities: { physicians?: string[]; equipment?: string[]; keywords?: string[] };
  };
  repName: string;
  tone?: OutreachTone;
}

const TONE_GUIDE: Record<OutreachTone, string> = {
  discovery:
    "Tone: warm discovery email. Reference the specific public signal you found, ask one open-ended question to confirm timing/scope, and propose a 15-minute intro call.",
  follow_up:
    "Tone: short follow-up to a prior thread. Reference the original signal, add ONE new insight or benchmark, and ask if next week works for a brief call.",
  executive_intro:
    "Tone: peer-to-peer executive introduction (C-suite / VP). Confident, brief, business-outcome focused. Reference the strategic implication of the signal. Propose a 20-minute conversation with a named Philips executive sponsor.",
  switch_pitch:
    "Tone: empathetic switch-pitch. Name the specific incumbent vendor / model and the disruptive event (FDA recall, end-of-life, vendor M&A, manufacturing change). Offer a stable Philips alternative as a like-for-like replacement, mention installed-base support and clinical continuity, and propose a 15-minute technical briefing this week.",
};

const SYSTEM = `You are an elite enterprise medical-device sales rep at Philips Medical. Draft a short, specific, non-spammy outreach email tailored to the lead. Reference the actual signal (RFQ, recall, capital project, vendor disruption, forum chatter, etc.). Keep it under 150 words, plain text, signed by the rep. Open with the recipient's specific situation, not generic flattery. End with one clear ask. Never invent facts not present in the brief.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "compose_email",
    description: "Compose an outreach email.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "<= 80 chars, specific not generic" },
        body: { type: "string", description: "<= 150 words plain text" },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
  },
};

/** Choose a default tone from the lead if caller didn't specify one. */
export function defaultToneForLead(lead: {
  source?: string | null;
  signal_type?: string | null;
}): OutreachTone {
  if (lead.signal_type === "recall" || lead.signal_type === "m_and_a") return "switch_pitch";
  if (lead.source === "openfda" || lead.source === "gdelt_m_and_a") return "switch_pitch";
  return "discovery";
}

export async function draftOutreachEmail(
  input: DraftInput,
): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
  const tone = input.tone ?? defaultToneForLead(input.lead);

  const userMsg = `Lead title: ${input.lead.title}
Hospital: ${input.lead.hospital ?? "unknown"}
Specialty: ${input.lead.specialty ?? "unknown"}
Signal type: ${input.lead.signal_type ?? "unknown"}
Incumbent competitor: ${input.lead.competitor_incumbent ?? "unknown"}
Vendor / model mentions: ${(input.lead.vendor_mentions ?? []).join(", ") || "n/a"}
Equipment focus: ${(input.lead.entities.equipment ?? []).join(", ") || "n/a"}
Key physicians/contacts: ${(input.lead.entities.physicians ?? []).join(", ") || "n/a"}
Signals: ${(input.lead.entities.keywords ?? []).join(", ") || "n/a"}

Background:
${input.lead.summary}

Rep name to sign as: ${input.repName}

${TONE_GUIDE[tone]}`;

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userMsg },
      ],
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "compose_email" } },
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: { message?: { tool_calls?: { function?: { arguments?: string } }[] } }[];
  };
  const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error("AI returned no draft");
  return JSON.parse(args);
}
