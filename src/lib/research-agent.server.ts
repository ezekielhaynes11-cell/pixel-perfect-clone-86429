import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { scrapeUrlForAccount } from "./ingest/scrape-url.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_STEPS = 6;

interface StructuredBrief {
  exec_summary: string;
  vendor_footprint: string[];
  capital_plans: string[];
  key_people: Array<{ name: string; role: string }>;
  recent_signals: string[];
  recommended_next_steps: string[];
  sources: Array<{ url: string; note: string }>;
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "read_existing_signals",
      description:
        "Read the leads, scraped pages and physicians already in the database for this account. Free; call once at the start.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "scrape_url",
      description:
        "Fetch and extract structured info from a public hospital/news/RFP URL. Use sparingly (max 2-3 calls).",
      parameters: {
        type: "object",
        properties: { url: { type: "string", description: "Absolute URL" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "finish",
      description: "Emit the final structured brief and stop.",
      parameters: {
        type: "object",
        properties: {
          exec_summary: {
            type: "string",
            description: "120-220 word strategic summary for a Philips sales rep.",
          },
          vendor_footprint: { type: "array", items: { type: "string" } },
          capital_plans: { type: "array", items: { type: "string" } },
          key_people: {
            type: "array",
            items: {
              type: "object",
              properties: { name: { type: "string" }, role: { type: "string" } },
              required: ["name", "role"],
              additionalProperties: false,
            },
          },
          recent_signals: { type: "array", items: { type: "string" } },
          recommended_next_steps: { type: "array", items: { type: "string" } },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: { url: { type: "string" }, note: { type: "string" } },
              required: ["url", "note"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "exec_summary",
          "vendor_footprint",
          "capital_plans",
          "key_people",
          "recent_signals",
          "recommended_next_steps",
          "sources",
        ],
        additionalProperties: false,
      },
    },
  },
];

const SYSTEM = `You are a Philips Medical sales intelligence researcher producing a deep-dive brief for one hospital/health-system account.

Process:
1. ALWAYS first call read_existing_signals to see what we already know.
2. Then optionally call scrape_url up to 2 times on the most relevant URLs surfaced (capital plan pages, RFP pages, leadership/fellowship pages).
3. Then call finish with the structured brief.

Rules:
- Be specific. Reference vendors, models, named people, dates.
- Recommended next steps must be concrete sales actions (who to contact, what to pitch).
- Do not invent facts not present in tool results.
- Hard limit: 6 tool calls total. Always call finish before that.`;

async function readExistingSignals(accountId: string) {
  const [{ data: account }, { data: leads }, { data: pages }, { data: physRows }] =
    await Promise.all([
      supabaseAdmin
        .from("accounts")
        .select("name, state, system, account_type, is_va, notes")
        .eq("id", accountId)
        .single(),
      supabaseAdmin
        .from("leads")
        .select(
          "title, summary, source, source_url, signal_type, vendor_mentions, competitor_incumbent, date_discovered, confidence",
        )
        .eq("account_id", accountId)
        .order("date_discovered", { ascending: false })
        .limit(40),
      supabaseAdmin
        .from("scraped_pages")
        .select("url, title, extracted, fetched_at")
        .eq("account_id", accountId)
        .order("fetched_at", { ascending: false })
        .limit(15),
      supabaseAdmin
        .from("lead_physicians")
        .select(
          "role_hint, physician_contacts!inner(full_name, credentials, primary_specialty, practice_city, practice_state)",
        )
        .in(
          "lead_id",
          (
            await supabaseAdmin.from("leads").select("id").eq("account_id", accountId).limit(40)
          ).data?.map((r) => r.id) ?? ["00000000-0000-0000-0000-000000000000"],
        )
        .limit(50),
    ]);
  return { account, leads: leads ?? [], scraped_pages: pages ?? [], physicians: physRows ?? [] };
}

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface ResearchProgress {
  steps: Array<{ tool: string; note: string }>;
  brief: StructuredBrief;
  markdown: string;
  sources: Array<{ url: string; note: string }>;
}

export async function runAccountResearch(accountId: string): Promise<ResearchProgress> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Account ID: ${accountId}\n\nProduce a deep-dive brief.` },
  ];
  const steps: Array<{ tool: string; note: string }> = [];
  let finalBrief: StructuredBrief | null = null;

  for (let step = 0; step < MAX_STEPS; step++) {
    const isLast = step === MAX_STEPS - 1;
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        tools: TOOLS,
        tool_choice: isLast ? { type: "function", function: { name: "finish" } } : "auto",
      }),
    });
    if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: ChatMsg["tool_calls"] } }[];
    };
    const msg = json.choices?.[0]?.message;
    if (!msg) throw new Error("AI returned no message");

    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

    if (!msg.tool_calls?.length) break;

    for (const call of msg.tool_calls) {
      const name = call.function.name;
      const args = JSON.parse(call.function.arguments || "{}");
      let toolResult: unknown = null;
      try {
        if (name === "read_existing_signals") {
          toolResult = await readExistingSignals(accountId);
          steps.push({ tool: name, note: `Loaded existing signals` });
        } else if (name === "scrape_url") {
          const out = await scrapeUrlForAccount({ url: args.url, accountId });
          toolResult = { title: out.title, extracted: out.extracted };
          steps.push({ tool: name, note: args.url });
        } else if (name === "finish") {
          finalBrief = args as StructuredBrief;
          toolResult = { ok: true };
          steps.push({ tool: name, note: "Brief complete" });
        } else {
          toolResult = { error: `Unknown tool: ${name}` };
        }
      } catch (e) {
        toolResult = { error: e instanceof Error ? e.message : String(e) };
        steps.push({ tool: name, note: `Error: ${(e as Error).message}` });
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolResult).slice(0, 12000),
      });
      if (finalBrief) break;
    }
    if (finalBrief) break;
  }

  if (!finalBrief) throw new Error("Research agent did not produce a brief");

  const md = briefToMarkdown(finalBrief);
  return { steps, brief: finalBrief, markdown: md, sources: finalBrief.sources };
}

function briefToMarkdown(b: StructuredBrief): string {
  const lines: string[] = [];
  lines.push(`## Executive Summary\n\n${b.exec_summary}\n`);
  if (b.recent_signals.length) {
    lines.push(`## Recent Signals\n`);
    for (const s of b.recent_signals) lines.push(`- ${s}`);
    lines.push("");
  }
  if (b.capital_plans.length) {
    lines.push(`## Capital Plans & Programs\n`);
    for (const c of b.capital_plans) lines.push(`- ${c}`);
    lines.push("");
  }
  if (b.vendor_footprint.length) {
    lines.push(`## Vendor Footprint\n`);
    for (const v of b.vendor_footprint) lines.push(`- ${v}`);
    lines.push("");
  }
  if (b.key_people.length) {
    lines.push(`## Key People\n`);
    for (const p of b.key_people) lines.push(`- **${p.name}** — ${p.role}`);
    lines.push("");
  }
  if (b.recommended_next_steps.length) {
    lines.push(`## Recommended Next Steps\n`);
    for (const s of b.recommended_next_steps) lines.push(`1. ${s}`);
    lines.push("");
  }
  return lines.join("\n");
}
