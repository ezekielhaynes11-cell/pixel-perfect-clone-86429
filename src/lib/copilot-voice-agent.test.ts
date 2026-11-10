import { describe, it, expect } from "vitest";
import {
  cleanSpeechScript,
  pcm16ToWavBase64,
  synthesizeSpeechGoogleCloud,
} from "./tts.server";
import { buildDeterministicOutreachDraft } from "./outreach.server";
import {
  GamePlanItemSchema,
  VoiceAgentBriefingResponseSchema,
  inferRecommendedModalityAndAngle,
  type VoiceAgentBriefingResponse,
} from "./copilot.functions";
import { resolveAudioDataUri } from "@/components/dashboard/CopilotVoiceAgent";
import type { Lead } from "@/data/leads";

describe("Copilot Voice Agent — Speech Sanitization & Formatting", () => {
  it("strips markdown headings, bold markers, and raw URLs from spoken script without robotic word insertion", () => {
    const raw = `### Morning Briefing for Mike Patrick
**Good morning, Mike.** Here is your [daily recap](https://example.com/brief).
* Target 1: Memorial Hermann - $1.2M Deal Value.
Visit https://philips.com for details.`;

    const cleaned = cleanSpeechScript(raw);

    expect(cleaned).not.toContain("###");
    expect(cleaned).not.toContain("**");
    expect(cleaned).not.toContain("https://");
    expect(cleaned).not.toContain("[daily recap]");
    expect(cleaned).not.toContain("Next, ");
    expect(cleaned).toContain("daily recap");
    expect(cleaned).toContain("Good morning, Mike.");
    expect(cleaned).toContain("$1.2 million");
  });

  it("expands medical and geographic abbreviations naturally without robotic letter spelling", () => {
    const raw = "VA hospital in TX evaluating POCUS and PET/CT equipment in AR and OK under RHTP.";
    const cleaned = cleanSpeechScript(raw);

    expect(cleaned).toContain("Texas");
    expect(cleaned).toContain("Arkansas");
    expect(cleaned).toContain("Oklahoma");
    expect(cleaned).toContain("point-of-care ultrasound");
    expect(cleaned).toContain("PET CT");
    expect(cleaned).not.toContain("P-E-T C-T");
    expect(cleaned).toContain("Rural Health Transformation");
  });

  it("handles empty or whitespace strings gracefully", () => {
    expect(cleanSpeechScript("")).toBe("");
    expect(cleanSpeechScript("   ")).toBe("");
  });

  it("wraps raw 24kHz PCM16 audio into a valid RIFF WAV base64 payload and resolves data URI", () => {
    const fakePcm = Buffer.alloc(480, 0).toString("base64");
    const wavB64 = pcm16ToWavBase64(fakePcm, 24000);
    const wavBytes = Buffer.from(wavB64, "base64");

    expect(wavBytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(wavBytes.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(resolveAudioDataUri(wavB64)).toMatch(/^data:audio\/wav;base64,/);
  });
});

describe("Copilot Voice Agent — Clinical Modality & Tactical Angle Inferences", () => {
  const baseLead: Lead = {
    id: "lead-test-1",
    title: "Memorial Hermann Health System",
    summary: "Evaluation of equipment modernization",
    source: "sam_gov",
    sourceUrl: "#",
    confidence: 85,
    dateDiscovered: new Date().toISOString(),
    hospital: "Memorial Hermann",
    specialty: "Cardiology",
    territory: "TX",
    estimatedValueUsd: 1200000,
    winProbability: 75,
    competitorIncumbent: "Siemens Artis",
    entities: {
      hospitals: ["Memorial Hermann"],
      physicians: ["Dr. Sarah Jenkins"],
      equipment: [],
      keywords: [],
    },
    priority: "high",
    signalType: "rfp",
    accountType: "Hospital",
    vendorMentions: ["Siemens"],
    accountId: null,
    sourceContacts: [],
  };

  it("infers Azurion 7 Biplane for cath lab and angiography leads", () => {
    const cathLead: Lead = {
      ...baseLead,
      title: "Cardiac Cath Lab Expansion & Biplane Replacement",
      summary: "Modernizing cardiac angiography suite",
      entities: { ...baseLead.entities, equipment: ["biplane cath lab"] },
    };

    const res = inferRecommendedModalityAndAngle(cathLead);
    expect(res.modality).toContain("Azurion");
    expect(res.angle).toContain("ClarityIQ");
  });

  it("infers Spectral CT 7500 for CT scanner inquiries", () => {
    const ctLead: Lead = {
      ...baseLead,
      title: "Computed Tomography Scanner Modernization",
      summary: "Evaluation of dual-energy CT solutions",
      entities: { ...baseLead.entities, equipment: ["CT scanner"] },
    };

    const res = inferRecommendedModalityAndAngle(ctLead);
    expect(res.modality).toContain("Spectral CT");
    expect(res.angle).toContain("always-on detector-based spectral");
  });

  it("infers BlueSeal Magnet MRI for MRI equipment inquiries", () => {
    const mriLead: Lead = {
      ...baseLead,
      title: "Diagnostic MRI Replacement Project",
      summary: "Replacing helium-dependent 1.5T magnet",
      entities: { ...baseLead.entities, equipment: ["MRI system"] },
    };

    const res = inferRecommendedModalityAndAngle(mriLead);
    expect(res.modality).toContain("BlueSeal");
    expect(res.angle).toContain("helium");
  });

  it("infers EPIQ ultrasound for FDA recall opportunities", () => {
    const recallLead: Lead = {
      ...baseLead,
      signalType: "recall",
      title: "FDA Class II Recall Notice on Competitor Ultrasound",
      summary: "Urgent displacement opportunity",
    };

    const res = inferRecommendedModalityAndAngle(recallLead);
    expect(res.modality).toContain("Ultrasound");
    expect(res.angle).toContain("patient safety");
  });
});

describe("Copilot Voice Agent — Structured Contract Validation", () => {
  it("validates valid GamePlanItem and VoiceAgentBriefingResponse schemas", () => {
    const mockBriefing: VoiceAgentBriefingResponse = {
      audioBase64: null,
      spokenScript:
        "Good morning, Mike. Here is what's moving across your territory today.",
      durationEstimateSeconds: 45,
      leadCount: 12,
      pipelineValueUsd: 3900000,
      gamePlan: [
        {
          leadId: "00000000-0000-0000-0000-000000000001",
          hospital: "Memorial Hermann Hospital",
          state: "TX",
          estimatedValueUsd: 1200000,
          priorityLevel: "urgent",
          contactName: "Dr. Sarah Jenkins",
          contactTitle: "Chief of Radiology",
          recommendedModality: "Azurion 7 Biplane IGT",
          tacticalAngle:
            "Position Philips Azurion 7 with ClarityIQ to reduce radiation dose by 73%.",
          incumbentToDisplace: "Siemens Artis zee",
        },
      ],
    };

    const parsed = VoiceAgentBriefingResponseSchema.parse(mockBriefing);
    expect(parsed.spokenScript).toContain("Good morning, Mike");
    expect(parsed.gamePlan).toHaveLength(1);
    expect(parsed.gamePlan[0].priorityLevel).toBe("urgent");
  });

  it("fails validation if priority level is invalid", () => {
    const invalidItem = {
      leadId: "00000000-0000-0000-0000-000000000001",
      hospital: "Memorial Hermann",
      state: "TX",
      estimatedValueUsd: 500000,
      priorityLevel: "super-critical", // invalid
      contactName: null,
      contactTitle: null,
      recommendedModality: "CT 7500",
      tacticalAngle: "Angle",
      incumbentToDisplace: null,
    };

    expect(() => GamePlanItemSchema.parse(invalidItem)).toThrow();
  });
});

describe("Copilot Voice Agent — Dual TTS Engine Resilience", () => {
  it("gracefully falls back to null when Google Cloud API key is absent without throwing", async () => {
    const prevKey = process.env.GOOGLE_CLOUD_API_KEY;
    const prevGeminiKey = process.env.GEMINI_API_KEY;
    const prevGoogleKey = process.env.GOOGLE_API_KEY;

    try {
      delete process.env.GOOGLE_CLOUD_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const audioBase64 = await synthesizeSpeechGoogleCloud(
        "Good morning, Mike. Testing fallback audio synthesis.",
      );

      // Must return null without throwing, allowing client Web Speech API to seamlessly activate
      expect(audioBase64).toBeNull();
    } finally {
      if (prevKey) process.env.GOOGLE_CLOUD_API_KEY = prevKey;
      if (prevGeminiKey) process.env.GEMINI_API_KEY = prevGeminiKey;
      if (prevGoogleKey) process.env.GOOGLE_API_KEY = prevGoogleKey;
    }
  });

  it("drafts personalized outreach emails signed by Mike Patrick as Philips Healthcare Sales Rep", () => {
    const draft = buildDeterministicOutreachDraft(
      {
        lead: {
          title: "Cardiac Cath Lab Biplane Modernization",
          summary: "Replacing aging biplane angiography system",
          hospital: "Baylor Scott & White Medical Center",
          specialty: "Cardiology",
          entities: {
            physicians: ["Dr. Marcus Vance (Director of Interventional Cardiology)"],
            equipment: ["Azurion 7 Biplane"],
          },
        },
      },
      "discovery",
    );

    expect(draft.body).toContain("Hi Dr. Marcus Vance,");
    expect(draft.body).toContain("I'm Mike Patrick, your Philips Healthcare representative");
    expect(draft.body).toContain("Mike Patrick\nPhilips Healthcare · Territory Sales Representative (TX · OK · AR · LA)");
  });
});
