const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface DraftInput {
  lead: {
    title: string;
    summary: string;
    hospital: string | null;
    specialty: string | null;
    entities: { physicians?: string[]; equipment?: string[]; keywords?: string[] };
  };
  repName: string;
}

const SYSTEM = `You are an elite enterprise medical-device sales rep at Phillips Medical. Draft a short, specific, non-spammy outreach email tailored to the lead. Reference the actual signal (RFQ, recall, capital project, etc.). Keep it under 140 words, plain text, signed by the rep. Open with the recipient's specific situation, not generic flattery. End with one clear ask (15-min intro call). Never invent facts not present in the brief.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "compose_email",
    description: "Compose an outreach email.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "<= 80 chars, specific not generic" },
        body: { type: "string", description: "<= 140 words plain text" },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
  },
};

export async function draftOutreachEmail(input: DraftInput): Promise<{ subject: string; body: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const userMsg = `Lead title: ${input.lead.title}
Hospital: ${input.lead.hospital ?? "unknown"}
Specialty: ${input.lead.specialty ?? "unknown"}
Equipment focus: ${(input.lead.entities.equipment ?? []).join(", ") || "n/a"}
Key physicians/contacts: ${(input.lead.entities.physicians ?? []).join(", ") || "n/a"}
Signals: ${(input.lead.entities.keywords ?? []).join(", ") || "n/a"}

Background:
${input.lead.summary}

Rep name to sign as: ${input.repName}`;

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
