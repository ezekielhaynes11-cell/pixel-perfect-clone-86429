import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COPILOT_TOOLS, runCopilotTool } from "./copilot-tools.server";

const GOOGLE_OPENAI_COMPATIBLE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_TOOL_CALLS = 8;

const SYSTEM = `You are the Yield Architect Copilot — an enterprise sales intelligence assistant for Philips Medical sales representatives covering TX, OK, AR, and LA.

You have live tools to query leads, accounts, physicians, and account briefs; to draft targeted outreach emails; and to enrich contact information.

Core Directives:
- Always call a tool before answering questions about leads, accounts, or physicians — ground every answer in real data.
- If a query returns 0 results, retry once with broader criteria (e.g. drop narrow filters or broaden search keywords).
- Querying leads returns both enriched and raw leads.
- When referencing leads, cite specific hospital names, states, equipment categories, and estimated values.
- Format all entity references with markdown links: [Lead title](/?lead=<id>) or [Account name](/accounts/<id>).
- Keep responses concise, high-contrast, and scannable with bullet points and bold key facts.`;

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

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

type ToolArgumentMap = Record<string, string | number | boolean | null>;

export type CopilotStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_start"; name: string; args: ToolArgumentMap }
  | { type: "tool_end"; name: string; summary: string }
  | { type: "error"; message: string };

interface ResolvedApiConfig {
  endpointUrl: string;
  authHeader: string;
  model: string;
}

function resolveApiConfig(): ResolvedApiConfig | null {
  const customUrl = process.env.COPILOT_API_URL?.trim() || process.env.GOOGLE_CLOUD_API_URL?.trim();
  const googleApiKey =
    process.env.GOOGLE_CLOUD_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  const lovableApiKey = process.env.LOVABLE_API_KEY?.trim();

  if (customUrl) {
    const bearer = googleApiKey || lovableApiKey || "custom-token";
    return {
      endpointUrl: customUrl,
      authHeader: `Bearer ${bearer}`,
      model: process.env.GOOGLE_CLOUD_MODEL?.trim() || "gemini-3.8-flash",
    };
  }

  if (googleApiKey) {
    return {
      endpointUrl: GOOGLE_OPENAI_COMPATIBLE_URL,
      authHeader: `Bearer ${googleApiKey}`,
      model: process.env.GOOGLE_CLOUD_MODEL?.trim() || "gemini-3.8-flash",
    };
  }

  if (lovableApiKey) {
    return {
      endpointUrl: LOVABLE_GATEWAY_URL,
      authHeader: `Bearer ${lovableApiKey}`,
      model: "google/gemini-2.5-flash",
    };
  }

  return null;
}

interface LocalLeadRecord {
  id: string;
  title: string;
  hospital?: string | null;
  state?: string | null;
  specialty?: string | null;
  confidence: number;
  estimated_value_usd?: number | null;
  summary: string;
  source: string;
  date_discovered: string;
}

interface LocalPhysicianRecord {
  full_name: string;
  credentials?: string | null;
  title?: string | null;
  primary_specialty?: string | null;
  practice_city?: string | null;
  practice_state?: string | null;
  email?: string | null;
  practice_phone?: string | null;
}

async function* executeDeterministicCopilotFallback(
  userQuery: string,
): AsyncGenerator<CopilotStreamEvent> {
  const lowerQuery = userQuery.toLowerCase();

  // Intent 1: Outreach Drafting
  if (
    /\b(draft|compose|pitch|outreach)\b/.test(lowerQuery) ||
    /\bwrite\s+(?:an?\s+)?(?:email|pitch|draft)\b/.test(lowerQuery)
  ) {
    yield {
      type: "tool_start",
      name: "query_leads",
      args: { min_confidence: 70, limit: 3 },
    };

    const leadsResult = (await runCopilotTool("query_leads", {
      min_confidence: 70,
      limit: 3,
    })) as { leads?: LocalLeadRecord[] };

    yield {
      type: "tool_end",
      name: "query_leads",
      summary: `${leadsResult.leads?.length ?? 0} leads identified`,
    };

    const targetLead = leadsResult.leads?.[0];
    if (targetLead) {
      yield {
        type: "tool_start",
        name: "draft_outreach",
        args: { lead_id: targetLead.id, rep_name: "Philips Account Team" },
      };

      const draftResult = (await runCopilotTool("draft_outreach", {
        lead_id: targetLead.id,
        rep_name: "Philips Account Team",
      })) as { subject?: string; body?: string };

      yield {
        type: "tool_end",
        name: "draft_outreach",
        summary: "Draft created",
      };

      const textResponse = [
        `### Targeted Sales Outreach Prepared`,
        ``,
        `**Lead Target:** [${targetLead.title}](/?lead=${targetLead.id})`,
        `**Account:** ${targetLead.hospital ?? "Territory Health System"} (${targetLead.state ?? "Regional"})`,
        `**Subject:** ${draftResult.subject ?? "Strategic Equipment Modernization"}`,
        ``,
        `\`\`\`text`,
        draftResult.body ?? "",
        `\`\`\``,
        ``,
        `> **Note:** Connected directly via Yield Architect Intelligence. Configure \`GOOGLE_CLOUD_API_KEY\` in your deployment environment for custom generative workflows.`,
      ].join("\n");

      yield { type: "text", text: textResponse };
      return;
    }
  }

  // Intent 2: Physician / Decision-Maker Search
  if (
    /\b(physicians?|doctors?|contacts?|emails?|directors?|chiefs?|cardiolog\w*|radiolog\w*)\b/.test(
      lowerQuery,
    )
  ) {
    const stateMatch = lowerQuery.match(/\b(texas|tx|oklahoma|ok|arkansas|ar|louisiana|la)\b/);
    const stateMap: Record<string, string> = {
      texas: "TX",
      tx: "TX",
      oklahoma: "OK",
      ok: "OK",
      arkansas: "AR",
      ar: "AR",
      louisiana: "LA",
      la: "LA",
    };
    const leadState = stateMatch ? stateMap[stateMatch[1]] : null;

    yield {
      type: "tool_start",
      name: "query_physicians",
      args: { lead_state: leadState, has_email: true, limit: 5 },
    };

    const physiciansResult = (await runCopilotTool("query_physicians", {
      lead_state: leadState ?? undefined,
      has_email: true,
      limit: 5,
    })) as { physicians?: LocalPhysicianRecord[]; count?: number };

    yield {
      type: "tool_end",
      name: "query_physicians",
      summary: `${physiciansResult.physicians?.length ?? 0} decision-makers found`,
    };

    const list = physiciansResult.physicians ?? [];
    if (list.length === 0) {
      yield {
        type: "text",
        text: `No verified physician contacts with direct email were found matching this territory query. Try broadening your criteria or triggering **Show contact & enrich decision-maker** on relevant lead cards.`,
      };
      return;
    }

    const items = list.map((physician) => {
      const location = [physician.practice_city, physician.practice_state]
        .filter(Boolean)
        .join(", ");
      const role = physician.title || physician.primary_specialty || "Clinical Specialist";
      const email = physician.email ? `\`${physician.email}\`` : "Contact on file";
      const phone = physician.practice_phone ? `· 📞 ${physician.practice_phone}` : "";
      return `- **${physician.full_name}${physician.credentials ? `, ${physician.credentials}` : ""}** — ${role} (${location})\n  - Direct: ${email} ${phone}`;
    });

    yield {
      type: "text",
      text: [
        `### Verified Clinical Contacts in Territory`,
        ``,
        ...items,
        ``,
        `> Coded directly from live NPPES & verified directory records in your Supabase database.`,
      ].join("\n"),
    };
    return;
  }

  // Intent 3: Leads & Opportunities Search
  let targetState: string | null = null;
  if (/\b(texas|tx)\b/.test(lowerQuery)) targetState = "TX";
  if (/\b(oklahoma|ok)\b/.test(lowerQuery)) targetState = "OK";
  if (/\b(arkansas|ar)\b/.test(lowerQuery)) targetState = "AR";
  if (/\b(louisiana|la)\b/.test(lowerQuery)) targetState = "LA";

  const isRural = /\b(rural|rht|critical access|cah)\b/.test(lowerQuery);
  const isHighPriority = /\b(priority|high|urgent|rfp|recall|top)\b/.test(lowerQuery);

  const queryArgs = {
    state: targetState,
    min_confidence: isHighPriority ? 75 : 50,
    text_search: isRural ? "rural" : null,
    limit: 5,
  };

  yield {
    type: "tool_start",
    name: "query_leads",
    args: queryArgs,
  };

  const leadSearchResult = (await runCopilotTool("query_leads", {
    state: targetState ?? undefined,
    min_confidence: isHighPriority ? 75 : 50,
    text_search: isRural ? "rural" : undefined,
    limit: 5,
  })) as {
    leads?: LocalLeadRecord[];
    count?: number;
  };

  yield {
    type: "tool_end",
    name: "query_leads",
    summary: `${leadSearchResult.leads?.length ?? 0} leads returned`,
  };

  const leads = leadSearchResult.leads ?? [];
  if (leads.length === 0) {
    yield {
      type: "text",
      text: `No leads matched your specific query parameters. Try selecting "All territories" or running **Refresh Intelligence** to pull the latest public signals.`,
    };
    return;
  }

  const leadItems = leads.map((lead) => {
    const value =
      lead.estimated_value_usd && lead.estimated_value_usd > 0
        ? ` · **Est. $${(lead.estimated_value_usd / 1e6).toFixed(1)}M**`
        : "";
    const hospital = lead.hospital ? ` · *${lead.hospital}*` : "";
    return `1. [**${lead.title}**](/?lead=${lead.id}) (${lead.confidence}% confidence${value}${hospital})\n   ${lead.summary}`;
  });

  const heading = isRural
    ? "### Fresh Rural RHT Buying Signals"
    : targetState
      ? `### Active Sales Intelligence for ${targetState}`
      : "### Top Active Opportunities";

  yield {
    type: "text",
    text: [
      heading,
      ``,
      ...leadItems,
      ``,
      `> Grounded directly in live Supabase sales intelligence. Connect your Google Cloud API key (\`GOOGLE_CLOUD_API_KEY\` or \`GOOGLE_CLOUD_API_URL\`) for custom LLM orchestration.`,
    ].join("\n"),
  };
}

export async function* executeCopilotChat(
  inputMessages: Array<{ role: "user" | "assistant"; content: string }>,
): AsyncGenerator<CopilotStreamEvent> {
  const apiConfig = resolveApiConfig();
  const latestUserMessage =
    [...inputMessages].reverse().find((message) => message.role === "user")?.content || "";

  // If no external LLM gateway is configured, execute the local fallback engine
  if (!apiConfig) {
    yield* executeDeterministicCopilotFallback(latestUserMessage);
    return;
  }

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM },
    ...inputMessages.map((message) => ({ role: message.role, content: message.content })),
  ];

  let toolCallsUsed = 0;

  for (let step = 0; step < MAX_TOOL_CALLS + 2; step++) {
    let gatewayResponse: Response;
    try {
      gatewayResponse = await fetch(apiConfig.endpointUrl, {
        method: "POST",
        headers: {
          Authorization: apiConfig.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: apiConfig.model,
          messages,
          tools: COPILOT_TOOLS,
          tool_choice: toolCallsUsed >= MAX_TOOL_CALLS ? "none" : "auto",
        }),
      });
    } catch (fetchError) {
      console.error("[copilot] Google Cloud API network failure:", fetchError);
      yield* executeDeterministicCopilotFallback(latestUserMessage);
      return;
    }

    if (!gatewayResponse.ok) {
      const errorBody = await gatewayResponse.text();
      console.error(`[copilot] Google Cloud API returned ${gatewayResponse.status}:`, errorBody);

      // Fall back gracefully to deterministic tool execution so the user gets real data
      yield* executeDeterministicCopilotFallback(latestUserMessage);
      return;
    }

    const responsePayload = (await gatewayResponse.json()) as {
      choices?: {
        message?: { content?: string | null; tool_calls?: ChatMsg["tool_calls"] };
      }[];
    };
    const assistantMessage = responsePayload.choices?.[0]?.message;
    if (!assistantMessage) {
      yield* executeDeterministicCopilotFallback(latestUserMessage);
      return;
    }

    messages.push({
      role: "assistant",
      content: assistantMessage.content ?? null,
      tool_calls: assistantMessage.tool_calls,
    });

    if (!assistantMessage.tool_calls?.length) {
      if (assistantMessage.content) {
        yield { type: "text", text: assistantMessage.content };
      }
      return;
    }

    for (const call of assistantMessage.tool_calls) {
      toolCallsUsed++;
      let toolArguments: ToolArgumentMap = {};
      try {
        toolArguments = JSON.parse(call.function.arguments || "{}");
      } catch {
        toolArguments = {};
      }

      yield {
        type: "tool_start",
        name: call.function.name,
        args: toolArguments,
      };

      let toolExecutionResult: unknown;
      try {
        toolExecutionResult = await runCopilotTool(call.function.name, toolArguments);
      } catch (executionError) {
        toolExecutionResult = {
          error: executionError instanceof Error ? executionError.message : String(executionError),
        };
      }

      const summaryText = summarizeResult(call.function.name, toolExecutionResult);
      yield {
        type: "tool_end",
        name: call.function.name,
        summary: summaryText,
      };

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(toolExecutionResult).slice(0, 16000),
      });
    }
  }

  yield {
    type: "text",
    text: "_Reached tool-call limit. Please ask a more targeted inquiry._",
  };
}

export const copilotChat = createServerFn({ method: "POST" })
  .validator((input) => z.object({ messages: z.array(MessageSchema).min(1).max(40) }).parse(input))
  .handler(async function* ({ data }) {
    yield* executeCopilotChat(data.messages);
  });

function summarizeResult(name: string, result: unknown): string {
  const record = result as {
    count?: number;
    error?: string;
    draft_id?: string;
    exists?: boolean;
  };
  if (record?.error) return `Error: ${record.error}`;
  if (name === "draft_outreach") return record.draft_id ? "Draft created" : "Drafted";
  if (name === "get_account_brief") return record.exists ? "Brief found" : "No brief yet";
  if (typeof record?.count === "number") {
    return `${record.count} result${record.count === 1 ? "" : "s"}`;
  }
  return "Complete";
}
