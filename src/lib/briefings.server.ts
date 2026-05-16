const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface BriefingLead {
  title: string;
  summary: string;
  hospital: string | null;
  specialty: string | null;
  confidence: number;
  estimated_value_usd: number | null;
  win_probability: number | null;
}

export async function generateDailyBriefing(
  repName: string,
  leads: BriefingLead[],
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const summary = leads
    .map(
      (l, i) =>
        `${i + 1}. [${l.confidence}%] ${l.title} — ${l.hospital ?? "?"} · ${l.specialty ?? "?"} · est. $${Math.round(
          (l.estimated_value_usd ?? 0) / 1000,
        )}k @ ${Math.round((l.win_probability ?? 0) * 100)}% win\n   ${l.summary.slice(0, 280)}`,
    )
    .join("\n\n");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You are a Philips Medical chief of staff briefing the rep before their morning calls. Output crisp markdown: a 2-sentence executive summary, then a bulleted 'Today's plays' list (one bullet per lead with the single most actionable next step). Under 200 words total. Never invent facts.",
        },
        {
          role: "user",
          content: `Rep: ${repName}\n\nTop leads today:\n\n${summary}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "No briefing available.";
}
