import { z } from "zod";
import { logWarn } from "./logger.server";
import { sanitizeErrorText } from "./ingest/medical-gate";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GATEWAY_TIMEOUT_MS = 12_000;
export const DEFAULT_PHILIPS_REP_NAME = "Mike Patrick";

export type OutreachTone =
  | "discovery"
  | "follow_up"
  | "executive_intro"
  | "switch_pitch"
  | "rht_grant_pitch";

export interface DraftInput {
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
  repName?: string;
  tone?: OutreachTone;
}

function resolveRepName(rawName?: string | null): string {
  const trimmed = rawName?.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === "your philips rep" ||
    trimmed.toLowerCase() === "philips account team" ||
    trimmed.toLowerCase() === "sales rep"
  ) {
    return DEFAULT_PHILIPS_REP_NAME;
  }
  return trimmed;
}

const TONE_GUIDE: Record<OutreachTone, string> = {
  discovery:
    "Tone: warm, personal discovery note written in first-person by Mike Patrick as the dedicated Philips Healthcare Sales Representative. Reference the specific signal at their facility, ask one thoughtful question about their timeline, and propose a brief 15-minute intro call.",
  follow_up:
    "Tone: personal, concise follow-up from Mike Patrick at Philips Healthcare. Reference the original clinical/capital initiative, share one relevant regional benchmark, and ask if next week works for a quick call.",
  executive_intro:
    "Tone: peer-to-peer executive note from Mike Patrick, Philips Healthcare Territory Representative. Confident, warm, and outcome-focused. Reference the strategic impact of the signal and propose a 20-minute conversation alongside our regional Philips clinical specialist.",
  switch_pitch:
    "Tone: consultative, empathetic switch-pitch from Mike Patrick at Philips Healthcare. Name the specific incumbent vendor/model and disruptive event (FDA recall, end-of-life, vendor transition). Offer a dependable Philips replacement with installed-base continuity and biomed onboarding, and propose a 15-minute technical review this week.",
  rht_grant_pitch:
    "Tone: personal CMS $50B Rural Health Transformation (RHT) advisory note from Mike Patrick at Philips Healthcare. Align the hospital's rural mission with Philips' RHT-eligible solutions: BlueSeal Mobile 1.5T helium-free MRI, CT 5300 Smart Workflow, Radiology Operations Command Center (ROCC — benchmark: Arkansas Children's Hospital 73 cardiac MRIs/CTs in Year 1), eCareManager/eICU (Emory 2.1% 60-day readmission reduction), Avalon/Lumify maternal tele-ultrasound (Michigan DHHS 32,000 families), and EarlyVue VS30. Offer a 15-minute grant-scoping review.",
};

const SYSTEM = `You are writing a personal, one-to-one outreach email on behalf of Mike Patrick, Philips Healthcare Sales Representative covering Texas, Oklahoma, Arkansas, and Louisiana.
Write in a natural, warm, human first-person voice ("I'm Mike Patrick with Philips Healthcare...") tailored to the specific hospital and clinical decision-maker.
Reference the real clinical or procurement signal (RFQ, recall, CMS $50B RHT grant, capital expansion, or incumbent transition).
Keep it under 150 words, plain text, with zero generic marketing fluff.
Sign off personally with the rep's name and title: "Philips Healthcare | Territory Sales Representative (TX · OK · AR · LA)".
Never invent facts not present in the brief.`;

const TOOL = {
  type: "function" as const,
  function: {
    name: "compose_email",
    description: "Compose a personalized outreach email from the Philips sales rep.",
    parameters: {
      type: "object",
      properties: {
        subject: { type: "string", description: "<= 80 chars, specific and personal" },
        body: { type: "string", description: "<= 155 words plain text signed by the rep" },
      },
      required: ["subject", "body"],
      additionalProperties: false,
    },
  },
};

const gatewayDraftEnvelopeSchema = z.object({
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

const composedEmailSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

export function defaultToneForLead(lead: {
  source?: string | null;
  signal_type?: string | null;
}): OutreachTone {
  if (lead.source === "rural_rht") return "rht_grant_pitch";
  if (lead.signal_type === "recall" || lead.signal_type === "m_and_a") return "switch_pitch";
  if (lead.source === "openfda" || lead.source === "gdelt_m_and_a") return "switch_pitch";
  return "discovery";
}

function selectRuralBenchmarkLine(lead: DraftInput["lead"]): string {
  const combined =
    `${lead.title} ${lead.summary} ${(lead.entities.equipment ?? []).join(" ")}`.toLowerCase();
  if (/\b(maternal|obstet|perinatal|avalon|lumify)\b/.test(combined)) {
    return "With Michigan DHHS, Philips Avalon beltless fetal monitoring and Lumify with Reacts tele-ultrasound helped clinical teams reach 32,000 rural families while keeping high-risk mothers close to home.";
  }
  if (/\b(blueseal|mobile\s+1\.5t|ct\s*5300|cancer|screening)\b/.test(combined)) {
    return "Through Project EDDY, Philips helium-free BlueSeal Mobile 1.5T MRI and CT 5300 Smart Workflow enabled 2,800+ rural screenings without fixed vault construction or liquid helium logistics.";
  }
  return "At Arkansas Children's Hospital, Philips Radiology Operations Command Center (ROCC) supported 73 complex cardiac MRIs/CTs in Year 1 remotely, while Emory Healthcare cut 60-day readmissions by 2.1% with Philips eICU.";
}

function resolveGreetingRecipient(lead: DraftInput["lead"]): string {
  const rawContact = lead.entities.physicians?.[0]?.trim();
  if (rawContact) {
    // Strip role hints like "Dr. Sarah Lin (Cardiology Chair)" -> "Dr. Sarah Lin"
    const cleanName = rawContact.replace(/\s*\([^)]*\)\s*$/, "").split("—")[0]?.trim();
    if (cleanName) return `Hi ${cleanName},`;
  }
  if (lead.hospital?.trim()) {
    return `Hi ${lead.hospital.trim()} Team,`;
  }
  return "Hi there,";
}

function buildSignature(repName: string): string {
  return [
    `Best regards,`,
    `${repName}`,
    `Philips Healthcare · Territory Sales Representative (TX · OK · AR · LA)`,
  ].join("\n");
}

export function buildDeterministicOutreachDraft(
  input: DraftInput,
  tone: OutreachTone,
): { subject: string; body: string } {
  const repName = resolveRepName(input.repName);
  const hospital = input.lead.hospital?.trim() || "your clinical team";
  const greeting = resolveGreetingRecipient(input.lead);
  const signature = buildSignature(repName);
  const modality =
    input.lead.entities.equipment?.slice(0, 2).join(" and ") ||
    (input.lead.specialty
      ? `${input.lead.specialty} systems`
      : "diagnostic imaging and patient monitoring");
  const incumbent = input.lead.competitor_incumbent?.trim() || "incumbent equipment";

  if (tone === "rht_grant_pitch") {
    const benchmark = selectRuralBenchmarkLine(input.lead);
    return {
      subject: `${hospital} — CMS $50B Rural Health Transformation & Philips`.slice(0, 80),
      body: [
        greeting,
        ``,
        `I'm ${repName}, your regional Philips Healthcare representative. I'm reaching out personally regarding ${hospital}'s positioning around the $50B CMS Rural Health Transformation (RHT) Program.`,
        ``,
        `I'm helping rural hospitals across our territory scope grant-ready bundles across ${modality} — including BlueSeal helium-free Mobile 1.5T MRI, ROCC remote scanning, eICU, and EarlyVue VS30.`,
        ``,
        benchmark,
        ``,
        `Would you have 15 minutes next week for us to review RHT budget specifications for ${hospital}?`,
        ``,
        signature,
      ].join("\n"),
    };
  }

  if (tone === "switch_pitch") {
    return {
      subject: `Personal support for ${incumbent} notice — ${hospital}`.slice(0, 80),
      body: [
        greeting,
        ``,
        `I'm ${repName} with Philips Healthcare covering your region. Following the recent ${incumbent} ${input.lead.signal_type === "recall" ? "FDA recall notice" : "platform transition"} impacting ${modality}, I wanted to reach out personally to see how your clinical engineering and specialty teams are navigating it.`,
        ``,
        `I can coordinate like-for-like Philips ${modality} evaluation units, rapid biomed onboarding, and trade-in protection so ${hospital} avoids any procedural downtime.`,
        ``,
        `Do you have 15 minutes this week for a quick conversation to confirm whether your fleet is affected?`,
        ``,
        signature,
      ].join("\n"),
    };
  }

  if (tone === "executive_intro") {
    return {
      subject: `Strategic ${modality} alignment — ${hospital}`.slice(0, 80),
      body: [
        greeting,
        ``,
        `I'm ${repName}, Philips Healthcare Territory Representative for your region. I noted ${hospital}'s recent initiative (${input.lead.summary || input.lead.title}).`,
        ``,
        `I'm working directly with health systems across TX, OK, AR, and LA to standardize ${modality} workflows, lower total cost of ownership, and expand clinical capacity.`,
        ``,
        `Could we schedule a brief 20-minute conversation next week alongside my Philips clinical specialist to align on your capital roadmap?`,
        ``,
        signature,
      ].join("\n"),
    };
  }

  if (tone === "follow_up") {
    return {
      subject: `Following up from Mike Patrick (Philips): ${modality} at ${hospital}`.slice(0, 80),
      body: [
        greeting,
        ``,
        `This is ${repName} with Philips Healthcare following up on ${hospital}'s ${input.lead.specialty?.toLowerCase() ?? "clinical"} initiative (${input.lead.title.slice(0, 90)}).`,
        ``,
        `Peer hospitals across our TX/OK/AR/LA territory are pairing Philips ${modality} with remote clinical support to shorten turnaround times without adding staff burden.`,
        ``,
        `Does Tuesday or Thursday next week work for a quick 15-minute check-in with me?`,
        ``,
        signature,
      ].join("\n"),
    };
  }

  return {
    subject: `${hospital} — ${modality} planning (Mike Patrick · Philips)`.slice(0, 80),
    body: [
      greeting,
      ``,
      `I'm ${repName}, your Philips Healthcare representative covering ${hospital}. I saw the recent update regarding your facility (${input.lead.summary || input.lead.title}).`,
      ``,
      `As your team evaluates clinical and capital priorities around ${modality}, I'd love to learn how you are approaching equipment timelines for the upcoming cycle and share how we can support you locally.`,
      ``,
      `Do you have 15 minutes next week for a quick introductory call?`,
      ``,
      signature,
    ].join("\n"),
  };
}

export async function draftOutreachEmail(
  input: DraftInput,
): Promise<{ subject: string; body: string }> {
  const tone = input.tone ?? defaultToneForLead(input.lead);
  const repName = resolveRepName(input.repName);
  const normalizedInput: DraftInput = { ...input, repName };

  const googleApiKey =
    process.env.GOOGLE_CLOUD_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  const lovableApiKey = process.env.LOVABLE_API_KEY?.trim();
  const apiKey = googleApiKey || lovableApiKey;
  if (!apiKey) {
    return buildDeterministicOutreachDraft(normalizedInput, tone);
  }

  const endpointUrl = googleApiKey
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : GATEWAY_URL;
  const modelName = googleApiKey ? "gemini-2.5-flash" : "google/gemini-2.5-flash";

  const userMsg = `Lead title: ${input.lead.title}
Hospital: ${input.lead.hospital ?? "unknown"}
Specialty: ${input.lead.specialty ?? "unknown"}
Source: ${input.lead.source ?? "unknown"}
Signal type: ${input.lead.signal_type ?? "unknown"}
Incumbent competitor: ${input.lead.competitor_incumbent ?? "unknown"}
Vendor / model mentions: ${(input.lead.vendor_mentions ?? []).join(", ") || "n/a"}
Equipment focus: ${(input.lead.entities.equipment ?? []).join(", ") || "n/a"}
Key physicians/contacts: ${(input.lead.entities.physicians ?? []).join(", ") || "n/a"}
Signals: ${(input.lead.entities.keywords ?? []).join(", ") || "n/a"}

Background:
${input.lead.summary}

Sales Representative identity to write and sign as: ${repName}, Philips Healthcare Territory Sales Representative (TX, OK, AR, LA).

${TONE_GUIDE[tone]}`;

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userMsg },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "compose_email" } },
      }),
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });

    if (!response.ok) {
      logWarn("outreach.draft", "AI gateway returned non-2xx; using deterministic template", {
        status: response.status,
        detail: sanitizeErrorText(await response.text(), 180),
      });
      return buildDeterministicOutreachDraft(normalizedInput, tone);
    }

    const envelope = gatewayDraftEnvelopeSchema.parse(await response.json());
    const rawArguments = envelope.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!rawArguments) {
      return buildDeterministicOutreachDraft(normalizedInput, tone);
    }

    return composedEmailSchema.parse(JSON.parse(rawArguments));
  } catch (err) {
    logWarn("outreach.draft", "AI gateway call failed; using deterministic template", {
      error: err instanceof Error ? err.message : String(err),
    });
    return buildDeterministicOutreachDraft(normalizedInput, tone);
  }
}
