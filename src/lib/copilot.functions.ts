import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COPILOT_TOOLS, runCopilotTool } from "./copilot-tools.server";
import { cleanSpeechScript, synthesizeSpeechGoogleCloud } from "./tts.server";
import { fetchActiveLeadsWithRetry, getActiveCutoffIso } from "./leads.functions";
import {
  rowToLead,
  leadStateCode,
  leadInTerritoryScope,
  type LeadRow,
  type Lead,
} from "@/data/leads";
import { logInfo, logWarn } from "./logger.server";

const GOOGLE_OPENAI_COMPATIBLE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const LOVABLE_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MAX_TOOL_CALLS = 8;

const SYSTEM = `You are the Philips Sales Intelligence Gemini Copilot — the personal AI sales strategist and chief of staff for Mike, Philips Healthcare Territory Sales Representative covering Texas, Oklahoma, Arkansas, and Louisiana.

You have live tools to query hospital leads, accounts, verified physician decision-makers, and account briefs; to draft personalized outreach emails written personally as Mike; and to enrich contact information.

Core Directives:
- Address Mike naturally as a trusted senior partner ("Mike"). Speak with warmth, sharp clinical insight, and executive clarity — conversational, concise, never robotic.
- STRICT PREDICATE: Never use em dashes ("—") or en dashes ("–") or double hyphens ("--") in your writing. Use natural commas, colons, or periods.
- Always call a tool before answering questions about leads, accounts, or physicians — ground every answer in real territory data.
- If a query returns 0 results, retry once with broader criteria (e.g. drop narrow filters or broaden search keywords).
- Bring deep Philips Healthcare clinical & competitive intelligence to every conversation:
  • Image-Guided Therapy: Position Philips Azurion 7 Biplane with ClarityIQ (up to 73% lower radiation dose, faster lab turnaround) against Siemens Artis zee / Artis Q and GE Allia.
  • Diagnostic CT: Position Philips Spectral CT 7500 (always-on detector-based spectral imaging) and CT 5300 Smart Workflow against GE Revolution and Canon Aquilion.
  • MRI: Position Philips MR 5300 1.5T with BlueSeal helium-free magnet (7 liters sealed micro-cooling, no vent pipe, zero helium refill dependency) against Siemens Magnetom and GE Signa.
  • Ultrasound & Patient Monitoring: Position Philips EPIQ CVx, Affiniti, Lumify with Reacts tele-ultrasound, Avalon beltless maternal monitoring, eICU, and EarlyVue VS30 against Mindray and GE Vivid/Logiq.
  • CMS $50B Rural Health Transformation (RHT): Help Mike align rural and Critical Access hospitals with grant-ready Philips bundles.
- When drafting outreach emails or messages, ALWAYS write in first-person as Mike with Philips Healthcare. Sign off simply from "Mike", with zero em dashes ("—") or double hyphens ("--").
- When speaking conversationally, keep responses punchy and under 75 words, closing with one thoughtful next step for Mike.
- Format entity references with markdown links: [Lead title](/?lead=<id>) or [Account name](/accounts/<id>).`;

interface ChatMsg {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    extra_content?: unknown;
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

function resolveGoogleModelName(): string {
  const configured = process.env.GOOGLE_CLOUD_MODEL?.trim();
  if (!configured || configured === "gemini-3.8-flash") {
    return "gemini-2.5-flash";
  }
  return configured;
}

function resolveApiConfigs(customApiKey?: string): ResolvedApiConfig[] {
  const configs: ResolvedApiConfig[] = [];
  const customUrl = process.env.COPILOT_API_URL?.trim() || process.env.GOOGLE_CLOUD_API_URL?.trim();
  const googleApiKey =
    customApiKey?.trim() ||
    process.env.GOOGLE_CLOUD_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim();
  const lovableApiKey = process.env.LOVABLE_API_KEY?.trim();
  const googleModel = resolveGoogleModelName();

  if (customApiKey?.trim()) {
    configs.push({
      endpointUrl: GOOGLE_OPENAI_COMPATIBLE_URL,
      authHeader: `Bearer ${customApiKey.trim()}`,
      model: googleModel,
    });
  }

  if (customUrl) {
    const bearer = googleApiKey || lovableApiKey || "custom-token";
    configs.push({
      endpointUrl: customUrl,
      authHeader: `Bearer ${bearer}`,
      model: googleModel,
    });
  }

  if (googleApiKey && (!customApiKey || googleApiKey !== customApiKey.trim())) {
    configs.push({
      endpointUrl: GOOGLE_OPENAI_COMPATIBLE_URL,
      authHeader: `Bearer ${googleApiKey}`,
      model: googleModel,
    });
  }

  if (lovableApiKey) {
    configs.push({
      endpointUrl: LOVABLE_GATEWAY_URL,
      authHeader: `Bearer ${lovableApiKey}`,
      model: "google/gemini-2.5-flash",
    });
  }

  return configs;
}

async function fetchGeminiWithCascade(
  configs: ResolvedApiConfig[],
  buildBody: (model: string) => Record<string, unknown>,
): Promise<Response | null> {
  for (const cfg of configs) {
    try {
      const response = await fetch(cfg.endpointUrl, {
        method: "POST",
        headers: {
          Authorization: cfg.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBody(cfg.model)),
      });
      if (response.ok) {
        return response;
      }
      const errorBody = await response.text().catch(() => "");
      console.error(`[copilot] Google Cloud API returned ${response.status}:`, errorBody);
    } catch (fetchError) {
      console.error("[copilot] Google Cloud API network failure:", fetchError);
    }
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

  // Intent 1: Outreach Drafting (personalized for Mike Patrick)
  if (
    /\b(draft|compose|pitch|outreach|email)\b/.test(lowerQuery) ||
    /\bwrite\s+(?:an?\s+)?(?:email|pitch|draft|message)\b/.test(lowerQuery)
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
        args: { lead_id: targetLead.id, rep_name: "Mike" },
      };

      const draftResult = (await runCopilotTool("draft_outreach", {
        lead_id: targetLead.id,
        rep_name: "Mike",
      })) as { subject?: string; body?: string };

      yield {
        type: "tool_end",
        name: "draft_outreach",
        summary: "Draft created from Mike",
      };

      const textResponse = [
        `### Personal Outreach Drafted from Mike`,
        ``,
        `Mike, I've prepared a personalized message from you as the Philips Healthcare representative for **[${targetLead.title}](/?lead=${targetLead.id})** at **${targetLead.hospital ?? "Territory Health System"}** (${targetLead.state ?? "Regional"}):`,
        ``,
        `**Subject:** ${draftResult.subject ?? "Strategic Equipment Modernization"}`,
        ``,
        `\`\`\`text`,
        draftResult.body ?? "",
        `\`\`\``,
        ``,
        `You can copy this directly or click **Draft Outreach** on the lead card to customize the tone and open it in your mail client.`,
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
        text: `Mike, no verified physician contacts with direct email were found matching that narrow filter yet. Try broadening the state filter or clicking **Enrich with Apollo** on the lead card to pull verified hospital decision-makers.`,
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
        `### Verified Clinical Decision-Makers for Mike`,
        ``,
        ...items,
        ``,
        `> Pulled from live NPPES & verified directory records in your territory database.`,
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
      text: `Mike, no leads matched that specific filter. Try selecting "All territories" or clicking **Refresh Intelligence** to pull the latest public signals.`,
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
      : "### Top Active Opportunities for Mike";

  yield {
    type: "text",
    text: [
      heading,
      ``,
      ...leadItems,
      ``,
      `> Grounded directly in live Supabase sales intelligence across TX, OK, AR, and LA.`,
    ].join("\n"),
  };
}

export async function* executeCopilotChat(
  inputMessages: Array<{ role: "user" | "assistant"; content: string }>,
  customApiKey?: string,
): AsyncGenerator<CopilotStreamEvent> {
  const apiConfigs = resolveApiConfigs(customApiKey);
  const latestUserMessage =
    [...inputMessages].reverse().find((message) => message.role === "user")?.content || "";

  // If no external LLM gateway is configured, execute the local fallback engine
  if (apiConfigs.length === 0) {
    yield* executeDeterministicCopilotFallback(latestUserMessage);
    return;
  }

  const messages: ChatMsg[] = [
    { role: "system", content: SYSTEM },
    ...inputMessages.map((message) => ({ role: message.role, content: message.content })),
  ];

  let toolCallsUsed = 0;

  for (let step = 0; step < MAX_TOOL_CALLS + 2; step++) {
    const gatewayResponse = await fetchGeminiWithCascade(apiConfigs, (model) => ({
      model,
      messages,
      tools: COPILOT_TOOLS,
      tool_choice: toolCallsUsed >= MAX_TOOL_CALLS ? "none" : "auto",
    }));

    if (!gatewayResponse) {
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
  .validator((input) =>
    z
      .object({
        messages: z.array(MessageSchema).min(1).max(40),
        apiKey: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async function* ({ data }) {
    yield* executeCopilotChat(data.messages, data.apiKey);
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

/* -------------------- Voice Agent Morning Briefing & Conversational Speech -------------------- */

export const GamePlanItemSchema = z.object({
  leadId: z.string(),
  hospital: z.string(),
  state: z.string(),
  estimatedValueUsd: z.number().nullable(),
  priorityLevel: z.enum(["urgent", "high", "strategic"]),
  contactName: z.string().nullable(),
  contactTitle: z.string().nullable(),
  recommendedModality: z.string(),
  tacticalAngle: z.string(),
  incumbentToDisplace: z.string().nullable(),
});
export type GamePlanItem = z.infer<typeof GamePlanItemSchema>;

export const VoiceAgentBriefingResponseSchema = z.object({
  audioBase64: z.string().nullable(),
  spokenScript: z.string(),
  durationEstimateSeconds: z.number(),
  leadCount: z.number(),
  pipelineValueUsd: z.number(),
  gamePlan: z.array(GamePlanItemSchema),
});
export type VoiceAgentBriefingResponse = z.infer<typeof VoiceAgentBriefingResponseSchema>;

export function inferRecommendedModalityAndAngle(lead: Lead): { modality: string; angle: string } {
  const text = `${lead.title} ${lead.summary} ${lead.entities.equipment.join(" ")}`.toLowerCase();

  if (lead.signalType === "recall" || /\b(recall|fda|defect)\b/i.test(text)) {
    return {
      modality: "EPIQ CVx / Affiniti Ultrasound",
      angle:
        "Highlight FDA regulatory compliance and patient safety advantage to displace recalled equipment.",
    };
  }
  if (/\b(mri|magnetic resonance|magnet|blueseal|helium)\b/i.test(text)) {
    return {
      modality: "MR 5300 1.5T / BlueSeal Magnet",
      angle:
        "Eliminate helium refill dependency and quench vent pipe costs with BlueSeal 7-liter micro-cooling technology.",
    };
  }
  if (/\b(cath|angio|angiography|cardio|biplane|interventional)\b/i.test(text)) {
    return {
      modality: "Azurion 7 Biplane IGT",
      angle:
        "Position Philips Azurion 7 with ClarityIQ to reduce patient radiation dose by 73% while accelerating lab turnaround.",
    };
  }
  if (/\b(ct|computed tomography|spectral|pet\/ct)\b/i.test(text)) {
    return {
      modality: "Spectral CT 7500",
      angle:
        "Offer always-on detector-based spectral reconstruction without workflow compromise or extra radiation.",
    };
  }
  if (lead.source === "rural_rht" || /\b(rural|critical access|rht|rhtp)\b/i.test(text)) {
    return {
      modality: "ClearVue / Lumify Point-of-Care Ultrasound",
      angle:
        "Unlock CMS $50B Rural Health Transformation capital grant matching for immediate community care access.",
    };
  }
  return {
    modality: "Philips Enterprise Diagnostic Imaging",
    angle:
      "Displace incumbent legacy equipment with bundled Philips fleet lifecycle service and predictable cost of ownership.",
  };
}

export const getVoiceAgentBriefing = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        territoryStates: z.array(z.string()).default(["TX", "OK", "AR", "LA"]),
        repName: z.string().default("Mike"),
        apiKey: z.string().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<VoiceAgentBriefingResponse> => {
    const territorySet = new Set(data.territoryStates);
    const activeCutoff = getActiveCutoffIso();
    const rawRows = await fetchActiveLeadsWithRetry(activeCutoff);

    const leads: Lead[] = rawRows
      .map((r) => rowToLead(r as LeadRow))
      .filter((l) => leadInTerritoryScope(l, territorySet));

    const totalPipelineValue = leads.reduce((acc, l) => acc + (l.estimatedValueUsd ?? 0), 0);
    const leadCount = leads.length;

    const sortedLeads = [...leads].sort((a, b) => {
      const aScore = (a.confidence || 0) + (a.estimatedValueUsd ? a.estimatedValueUsd / 20000 : 0);
      const bScore = (b.confidence || 0) + (b.estimatedValueUsd ? b.estimatedValueUsd / 20000 : 0);
      return bScore - aScore;
    });

    const topLeads = sortedLeads.slice(0, 3);

    const gamePlan: GamePlanItem[] = topLeads.map((l, index) => {
      const { modality, angle } = inferRecommendedModalityAndAngle(l);
      const hospital = l.hospital || l.entities.hospitals?.[0] || "Regional Medical Center";
      const state = leadStateCode(l) || "TX";
      const contact = l.sourceContacts?.[0];
      const physician = l.entities.physicians?.[0];

      let contactName: string | null = contact?.name || null;
      let contactTitle: string | null = contact?.title || null;

      if (!contactName && physician) {
        contactName = physician;
        contactTitle = "Director of Clinical Operations";
      }

      const priorityLevel: "urgent" | "high" | "strategic" =
        index === 0
          ? "urgent"
          : l.signalType === "recall" || (l.estimatedValueUsd ?? 0) >= 1_000_000
            ? "high"
            : "strategic";

      return {
        leadId: l.id,
        hospital,
        state,
        estimatedValueUsd: l.estimatedValueUsd ?? null,
        priorityLevel,
        contactName,
        contactTitle,
        recommendedModality: modality,
        tacticalAngle: angle,
        incumbentToDisplace:
          l.competitorIncumbent ||
          (l.vendorMentions.find((v) => !v.toLowerCase().includes("philips")) ?? "Incumbent"),
      };
    });

    let spokenScript = "";
    const apiConfigs = resolveApiConfigs(data.apiKey);

    if (apiConfigs.length > 0 && topLeads.length > 0) {
      const leadSummaries = gamePlan
        .map(
          (p, i) =>
            `${i + 1}. ${p.hospital} (${p.state}), Est. ${p.estimatedValueUsd ? `$${(p.estimatedValueUsd / 1e6).toFixed(1)}M` : "Strategic"}, Philips Modality: ${p.recommendedModality}, Displacing: ${p.incumbentToDisplace}, Decision-Maker: ${p.contactName ?? "Clinical Leadership"}, Strategy: ${p.tacticalAngle}`,
        )
        .join("\n");

      const prompt = `You are Gemini, acting as the personal Philips Healthcare Sales Intelligence Strategist speaking directly to Mike, Philips Sales Representative covering Texas, Oklahoma, Arkansas, and Louisiana.

Write a warm, natural, human-sounding morning briefing for Mike.
Rules:
1. Open naturally by greeting Mike by name ("Good morning, Mike.").
2. Speak like a sharp, trusted human colleague having a real morning strategy conversation over coffee — NOT a robotic list reader. Do not say "Target 1, Target 2" or "First, Second, Third". Weave the top opportunities into a smooth, insightful narrative.
3. STRICT PREDICATE: Never use em dashes ("—") or en dashes ("–") or double hyphens ("--").
4. Mention the overall territory momentum ($${(totalPipelineValue / 1e6).toFixed(1)}M across ${leadCount} active accounts) and walk Mike through how to approach these top accounts today:
${leadSummaries}
5. Offer to draft personal outreach emails from Mike or dive deeper into any hospital account if he asks.
6. Plain conversational sentences only — under 100 words.`;

      const res = await fetchGeminiWithCascade(apiConfigs, (model) => ({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.45,
        max_tokens: 320,
      }));

      if (res) {
        const aiJson = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const rawAiText = aiJson.choices?.[0]?.message?.content?.trim();
        if (rawAiText) {
          spokenScript = cleanSpeechScript(rawAiText);
        }
      }
    }

    // Conversational fallback if offline (natural human flow, no robotic "First/Second/Third" or pitch deck mentions)
    if (!spokenScript) {
      const formattedPipeline =
        totalPipelineValue >= 1e6
          ? `$${(totalPipelineValue / 1e6).toFixed(1)} million`
          : `$${Math.round(totalPipelineValue / 1000)} thousand`;

      const [first, second, third] = gamePlan;
      const narrativeParts: string[] = [
        `Good morning, Mike. We're tracking ${formattedPipeline} across ${leadCount} active hospital accounts in your territory today.`,
      ];

      if (first) {
        const contactPhrase = first.contactName ? ` reaching out directly to ${first.contactName}` : "";
        narrativeParts.push(
          `Your highest-leverage move this morning is ${first.hospital} in ${first.state}${contactPhrase}, where we can position ${first.recommendedModality} against ${first.incumbentToDisplace || "their legacy fleet"}.`,
        );
      }
      if (second) {
        narrativeParts.push(
          `Next, take a look at ${second.hospital} in ${second.state}, where ${second.tacticalAngle.charAt(0).toLowerCase()}${second.tacticalAngle.slice(1)}`,
        );
      }
      if (third) {
        narrativeParts.push(
          `We also have strong momentum at ${third.hospital} in ${third.state} for ${third.recommendedModality}.`,
        );
      }
      narrativeParts.push(
        `Tell me which account you want to tackle first, Mike, and I'll pull the clinical contacts or draft a personal email for you right now.`,
      );

      spokenScript = cleanSpeechScript(narrativeParts.join(" "));
    }

    const audioBase64 = await synthesizeSpeechGoogleCloud(spokenScript, data.apiKey);
    const wordCount = spokenScript.split(/\s+/).filter(Boolean).length;
    const durationEstimateSeconds = Math.max(12, Math.round(wordCount / 2.5));

    logInfo("copilot.voice", "Voice briefing generated for Mike", {
      repName: data.repName,
      leadCount,
      hasAudioBase64: Boolean(audioBase64),
      durationEstimateSeconds,
    });

    return {
      audioBase64,
      spokenScript,
      durationEstimateSeconds,
      leadCount,
      pipelineValueUsd: totalPipelineValue,
      gamePlan,
    };
  });

/**
 * Synthesizes natural conversational speech for any Gemini reply in the Copilot conversation.
 */
export const synthesizeCopilotSpeech = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        text: z.string().min(1).max(4000),
        apiKey: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ audioBase64: string | null; spokenText: string }> => {
    const spokenText = cleanSpeechScript(data.text);
    const audioBase64 = await synthesizeSpeechGoogleCloud(spokenText, data.apiKey);
    return { audioBase64, spokenText };
  });

/**
 * Diagnostic check verifying live connectivity with Google's Gemini 2.5 Flash API.
 */
export const checkGeminiApiStatus = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        apiKey: z.string().optional(),
      })
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const key =
      data?.apiKey?.trim() ||
      process.env.GOOGLE_CLOUD_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim();

    if (!key) {
      return {
        status: "unconfigured" as const,
        message: "No Google Gemini API key configured.",
      };
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] }),
          signal: AbortSignal.timeout(6000),
        },
      );

      if (res.ok) {
        return {
          status: "active" as const,
          model: "gemini-2.5-flash",
          voice: "Aoede",
          message: "Gemini 2.5 Flash & Aoede Voice Active",
        };
      }

      if (res.status === 402) {
        return {
          status: "credits_depleted" as const,
          message: "Google AI Studio prepayment credits depleted (HTTP 402).",
        };
      }

      return {
        status: "error" as const,
        code: res.status,
        message: `Google API returned HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        status: "network_error" as const,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  });
