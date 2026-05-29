import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COPILOT_TOOLS, runCopilotTool } from "./copilot-tools.server";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_TOOL_CALLS = 8;

const SYSTEM = `You are the Yield Architect Copilot — a sales intelligence assistant for Philips Medical sales reps covering TX, OK, AR, LA.

You have tools to query leads, accounts, physicians, and account briefs; to draft outreach emails; and to enrich or prospect contacts via Apollo.io. Use them.

Rules:
- Always call a tool before answering questions about leads/accounts/physicians — never make up data.
- If a tool returns 0 results, DO NOT give up. Try ONE broader call: drop the narrowest filter (state, signal_type, days_back, or enriched_only), or add a text_search keyword, before telling the user nothing matched.
- query_leads returns enriched and raw leads by default. Only set enriched_only=true if the user explicitly asks for "high-confidence" or "ready-to-send" leads.
- Cite specific names, hospitals, vendors, dates from tool results.
- When linking to an entity, use markdown links: [Lead title](/?lead=<id>) or [Account name](/accounts/<id>).
- Keep responses tight and scannable. Use bullet lists and bold for key facts.
- Apollo prospecting writes to the database. Confirm with the user before calling apollo_prospect with limit > 25.
- Hard limit: 8 tool calls per turn. Don't waste them.`;

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

export const copilotChat = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ messages: z.array(MessageSchema).min(1).max(40) }).parse(input),
  )
  .handler(async function* ({ data }) {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const messages: ChatMsg[] = [
      { role: "system", content: SYSTEM },
      ...data.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let toolCallsUsed = 0;

    for (let step = 0; step < MAX_TOOL_CALLS + 2; step++) {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages,
          tools: COPILOT_TOOLS,
          tool_choice: toolCallsUsed >= MAX_TOOL_CALLS ? "none" : "auto",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429) {
          yield { type: "error", message: "Rate limit hit — try again in a moment." } as const;
          return;
        }
        if (res.status === 402) {
          yield { type: "error", message: "AI credits exhausted. Top up in Settings → Workspace → Usage." } as const;
          return;
        }
        throw new Error(`AI gateway ${res.status}: ${body}`);
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: ChatMsg["tool_calls"] } }[];
      };
      const msg = json.choices?.[0]?.message;
      if (!msg) throw new Error("AI returned no message");

      messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });

      if (!msg.tool_calls?.length) {
        if (msg.content) yield { type: "text", text: msg.content } as const;
        return;
      }

      for (const call of msg.tool_calls) {
        toolCallsUsed++;
        const args = JSON.parse(call.function.arguments || "{}");
        yield { type: "tool_start", name: call.function.name, args } as const;
        let result: unknown;
        try {
          result = await runCopilotTool(call.function.name, args);
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        const summary = summarizeResult(call.function.name, result);
        yield { type: "tool_end", name: call.function.name, summary } as const;
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 16000),
        });
      }
    }
    yield { type: "text", text: "_Reached tool-call limit. Ask a more specific question._" } as const;
  });

function summarizeResult(name: string, result: unknown): string {
  const r = result as { count?: number; error?: string; draft_id?: string; exists?: boolean };
  if (r?.error) return `Error: ${r.error}`;
  if (name === "draft_outreach") return r.draft_id ? "Draft created" : "Drafted";
  if (name === "get_account_brief") return r.exists ? "Brief found" : "No brief yet";
  if (typeof r?.count === "number") return `${r.count} result${r.count === 1 ? "" : "s"}`;
  return "done";
}
