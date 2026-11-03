import { z } from "zod";
import { logWarn } from "./logger.server";
import { sanitizeErrorText } from "./ingest/medical-gate";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GATEWAY_TIMEOUT_MS = 12_000;

export type OutreachTone =
  "discovery" | "follow_up" | "executive_intro" | "switch_pitch" | "rht_grant_pitch";

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
  rht_grant_pitch:
    "Tone: strategic CMS $50B Rural Health Transformation (RHT) grant advisor. Align the hospital's rural mission with Philips' RHT-eligible portfolio: BlueSeal Mobile 1.5T helium-free MRI, CT 5300 Smart Workflow, Radiology Operations Command Center (ROCC — benchmark: Arkansas Children's Hospital 73 cardiac MRIs/CTs in Year 1), eCareManager/eICU (Emory 2.1% 60-day readmission reduction), Avalon/Lumify maternal tele-ultrasound (Michigan DHHS 32,000 families), and EarlyVue VS30. Offer a 15-minute grant-scoping review.",
};

const SYSTEM = `You are an elite enterprise medical-device sales rep at Philips Medical. Draft a short, specific, non-spammy outreach email tailored to the lead. Reference the actual signal (RFQ, recall, CMS $50B RHT grant, capital project, vendor disruption, etc.). Keep it under 150 words, plain text, signed by the rep. Open with the recipient's specific situation, not generic flattery. End with one clear ask. Never invent facts not present in the brief.`;

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

function buildDeterministicOutreachDraft(
  input: DraftInput,
  tone: OutreachTone,
): { subject: string; body: string } {
  const hospital = input.lead.hospital?.trim() || "your clinical team";
  const modality =
    input.lead.entities.equipment?.slice(0, 2).join(" and ") ||
    (input.lead.specialty
      ? `${input.lead.specialty} systems`
      : "diagnostic imaging and monitoring");
  const incumbent = input.lead.competitor_incumbent?.trim() || "incumbent equipment";

  if (tone === "rht_grant_pitch") {
    const benchmark = selectRuralBenchmarkLine(input.lead);
    return {
      subject: `${hospital} — CMS $50B Rural Health Transformation & Philips`.slice(0, 80),
      body: [
        `Hi Team,`,
        ``,
        `I'm reaching out regarding ${hospital}'s eligibility and active positioning around the $50B CMS Rural Health Transformation (RHT) Program.`,
        ``,
        `Philips is helping rural hospitals scope grant-ready bundles across ${modality} — including BlueSeal helium-free Mobile 1.5T MRI, ROCC remote scanning, eICU, and EarlyVue VS30.`,
        ``,
        benchmark,
        ``,
        `Would a 15-minute call next week be helpful to review RHT budget specifications for ${hospital}?`,
        ``,
        `Best,`,
        input.repName,
      ].join("\n"),
    };
  }

  if (tone === "switch_pitch") {
    return {
      subject: `Clinical continuity support for ${incumbent} notice — ${hospital}`.slice(0, 80),
      body: [
        `Hi Team,`,
        ``,
        `Following the recent ${incumbent} ${input.lead.signal_type === "recall" ? "FDA recall notice" : "platform transition"} impacting ${modality}, I wanted to share how Philips is supporting clinical engineering and specialty teams across TX, OK, AR, and LA.`,
        ``,
        `We can provide like-for-like ${modality} evaluation units, rapid biomed onboarding, and trade-in protection to avoid procedural downtime.`,
        ``,
        `Are you open to a brief 15-minute technical briefing this week to confirm whether your fleet is affected?`,
        ``,
        `Best,`,
        input.repName,
      ].join("\n"),
    };
  }

  if (tone === "executive_intro") {
    return {
      subject: `Strategic ${modality} alignment — ${hospital}`.slice(0, 80),
      body: [
        `Hello,`,
        ``,
        `I noted ${hospital}'s recent initiative (${input.lead.summary || input.lead.title}).`,
        ``,
        `Philips is partnering with health systems across the South-Central region to standardize ${modality} workflows, reduce total cost of ownership, and expand specialist capacity.`,
        ``,
        `Could we schedule a 20-minute executive discussion next week alongside our regional Philips clinical sponsor to align on your capital roadmap?`,
        ``,
        `Regards,`,
        input.repName,
      ].join("\n"),
    };
  }

  if (tone === "follow_up") {
    return {
      subject: `Following up: ${modality} at ${hospital}`.slice(0, 80),
      body: [
        `Hi Team,`,
        ``,
        `Following up on ${hospital}'s ${input.lead.specialty?.toLowerCase() ?? "clinical"} initiative (${input.lead.title.slice(0, 90)}).`,
        ``,
        `Peer hospitals in TX/OK/AR/LA are pairing Philips ${modality} with remote clinical support to shorten turnaround times without adding FTEs.`,
        ``,
        `Does Tuesday or Thursday next week work for a quick 15-minute check-in?`,
        ``,
        `Best,`,
        input.repName,
      ].join("\n"),
    };
  }

  return {
    subject: `${hospital} — ${modality} planning`.slice(0, 80),
    body: [
      `Hi Team,`,
      ``,
      `I saw the recent update regarding ${hospital} (${input.lead.summary || input.lead.title}).`,
      ``,
      `As you evaluate clinical and capital priorities around ${modality}, how is your team approaching equipment timelines for the upcoming cycle?`,
      ``,
      `Happy to share relevant benchmarks in a quick 15-minute intro call next week if useful.`,
      ``,
      `Best,`,
      input.repName,
    ].join("\n"),
  };
}

export async function draftOutreachEmail(
  input: DraftInput,
): Promise<{ subject: string; body: string }> {
  const tone = input.tone ?? defaultToneForLead(input.lead);
  const apiKey = process.env.LOVABLE_API_KEY?.trim();
  if (!apiKey) {
    return buildDeterministicOutreachDraft(input, tone);
  }

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

Rep name to sign as: ${input.repName}

${TONE_GUIDE[tone]}`;

  try {
    const response = await fetch(GATEWAY_URL, {
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
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
    });

    if (!response.ok) {
      logWarn("outreach.draft", "AI gateway returned non-2xx; using deterministic template", {
        status: response.status,
        detail: sanitizeErrorText(await response.text(), 180),
      });
      return buildDeterministicOutreachDraft(input, tone);
    }

    const envelope = gatewayDraftEnvelopeSchema.parse(await response.json());
    const rawArguments = envelope.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!rawArguments) {
      return buildDeterministicOutreachDraft(input, tone);
    }

    return composedEmailSchema.parse(JSON.parse(rawArguments));
  } catch (err) {
    logWarn("outreach.draft", "AI gateway call failed; using deterministic template", {
      error: err instanceof Error ? err.message : String(err),
    });
    return buildDeterministicOutreachDraft(input, tone);
  }
}
