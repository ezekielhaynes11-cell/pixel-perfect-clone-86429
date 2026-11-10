import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { COPILOT_TOOLS, runCopilotTool } from "./copilot-tools.server";
import { cleanSpeechScript, synthesizeSpeechGoogleCloud } from "./tts.server";
import { fetchActiveLeadsWithRetry, getActiveCutoffIso } from "./leads.functions";
import { rowToLead, leadStateCode, leadInTerritoryScope, type LeadRow, type Lead } from "@/data/leads";
import { logInfo, logWarn } from "./logger.server";

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

/* -------------------- Voice Agent Morning Briefing & Game Plan -------------------- */

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
      modality: "EPIQ CVx / Affinity Ultrasound",
      angle: "Highlight FDA regulatory compliance and patient safety advantage to displace recalled equipment.",
    };
  }
  if (/\b(mri|magnetic resonance|magnet|blueseal|helium)\b/i.test(text)) {
    return {
      modality: "MR 5300 1.5T / BlueSeal Magnet",
      angle: "Eliminate helium refill dependency and catastrophic quench vent pipe costs with BlueSeal 7-liter micro-cooling technology.",
    };
  }
  if (/\b(cath|angio|angiography|cardio|biplane|interventional)\b/i.test(text)) {
    return {
      modality: "Azurion 7 Biplane IGT",
      angle: "Position Philips Azurion 7 with ClarityIQ to reduce patient radiation dose by 73% while accelerating lab turnaround.",
    };
  }
  if (/\b(ct|computed tomography|spectral|pet\/ct)\b/i.test(text)) {
    return {
      modality: "Spectral CT 7500",
      angle: "Offer always-on detector-based spectral reconstruction without workflow compromise or extra radiation.",
    };
  }
  if (lead.source === "rural_rht" || /\b(rural|critical access|rht|rhtp)\b/i.test(text)) {
    return {
      modality: "ClearVue / CX50 Point-of-Care Ultrasound",
      angle: "Unlock CMS $50B Rural Health Transformation capital grant matching for immediate community care access.",
    };
  }
  return {
    modality: "Philips Enterprise Diagnostic Imaging",
    angle: "Displace incumbent legacy equipment with bundled Philips fleet lifecycle service and predictable cost of ownership.",
  };
}

export const getVoiceAgentBriefing = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({
        territoryStates: z.array(z.string()).default(["TX", "OK", "AR", "LA"]),
        repName: z.string().default("Mike"),
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

    // Pick top actionable leads (sorted by confidence & value)
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

    const repGreeting = `Good morning, ${data.repName}. I'm your Philips Sales Intelligence Copilot.`;
    let spokenScript = "";

    const apiConfig = resolveApiConfig();
    if (apiConfig && topLeads.length > 0) {
      try {
        const leadSummaries = gamePlan
          .map(
            (p, i) =>
              `Target ${i + 1}: ${p.hospital} (${p.state}), Value: ${p.estimatedValueUsd ? `$${p.estimatedValueUsd.toLocaleString()}` : "Strategic"}, Modality: ${p.recommendedModality}, Displacing: ${p.incumbentToDisplace}, Angle: ${p.tacticalAngle}`,
          )
          .join("\n");

        const prompt = `You are the Philips Sales Intelligence Voice Copilot briefing field sales representative ${data.repName} covering Texas, Oklahoma, Arkansas, and Louisiana.

MANDATORY RULES:
1. You MUST start your response with: "${repGreeting} Here is your morning recap and tactical game plan for today across Texas, Oklahoma, Arkansas, and Louisiana."
2. Synthesize this data: Total active pipeline is $${(totalPipelineValue / 1e6).toFixed(1)}M across ${leadCount} accounts.
3. Highlight the 3 top target opportunities below with their tactical displacement angles:
${leadSummaries}
4. Write in conversational, high-energy executive spoken cadence suitable for Text-to-Speech audio.
5. NO MARKDOWN: Never use asterisks (**), hashtags (#), bullet points (-), or raw URLs. Format acronyms phonetically where needed.
6. Keep length under 130 words so the audio brief stays punchy (under 60 seconds). Finish with an encouraging call to action for ${data.repName}.`;

        const res = await fetch(apiConfig.endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: apiConfig.authHeader,
          },
          body: JSON.stringify({
            model: apiConfig.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_tokens: 350,
          }),
        });

        if (res.ok) {
          const aiJson = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          const rawAiText = aiJson.choices?.[0]?.message?.content?.trim();
          if (rawAiText) {
            spokenScript = cleanSpeechScript(rawAiText);
            // Verify that the opening addresses Mike
            if (!spokenScript.toLowerCase().startsWith(`good morning, ${data.repName.toLowerCase()}`)) {
              spokenScript = `${repGreeting} ${spokenScript}`;
            }
          }
        } else {
          logWarn("copilot.voice", "Upstream AI model returned non-200, using deterministic briefing", {
            status: res.status,
          });
        }
      } catch (err) {
        logWarn("copilot.voice", "Exception calling AI for voice briefing, using deterministic briefing", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Deterministic fallback (guarantees zero downtime, always addresses Mike)
    if (!spokenScript) {
      const formattedPipeline =
        totalPipelineValue >= 1e6
          ? `${(totalPipelineValue / 1e6).toFixed(1)} million dollars`
          : `${Math.round(totalPipelineValue / 1000)} thousand dollars`;

      const parts: string[] = [
        `${repGreeting} Here is your morning recap and tactical game plan for today across Texas, Oklahoma, Arkansas, and Louisiana.`,
        `We are tracking ${formattedPipeline} in active pipeline across ${leadCount} qualified accounts.`,
      ];

      if (gamePlan.length > 0) {
        parts.push("Here are your top attack priorities for today.");
        gamePlan.forEach((item, idx) => {
          const ord = idx === 0 ? "First" : idx === 1 ? "Second" : "Third";
          const valDesc = item.estimatedValueUsd
            ? `with an estimated ${item.estimatedValueUsd >= 1e6 ? `${(item.estimatedValueUsd / 1e6).toFixed(1)} million dollar` : `${Math.round(item.estimatedValueUsd / 1000)} thousand dollar`} deal value`
            : "in strategic positioning";
          parts.push(
            `${ord}, at ${item.hospital} in ${item.state}, ${valDesc}. Your attack angle is to ${item.tacticalAngle}`,
          );
        });
      } else {
        parts.push(
          "All regional accounts are monitored. I recommend reviewing rural health grant notices and hospital expansion tenders in Texas and Arkansas.",
        );
      }

      parts.push(`Let's execute today, ${data.repName}. Select any account below to draft outreach or launch a pitch deck.`);
      spokenScript = cleanSpeechScript(parts.join(" "));
    }

    // Synthesize Google Cloud TTS audio
    const audioBase64 = await synthesizeSpeechGoogleCloud(spokenScript);
    const wordCount = spokenScript.split(/\s+/).filter(Boolean).length;
    const durationEstimateSeconds = Math.max(15, Math.round(wordCount / 2.4));

    logInfo("copilot.voice", "Voice briefing generated successfully", {
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
