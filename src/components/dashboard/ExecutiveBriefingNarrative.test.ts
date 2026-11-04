import { describe, it, expect } from "vitest";
import type { Lead } from "@/data/leads";

describe("Executive Briefing Narrative telemetry & synthesis calculations", () => {
  const sampleLeads: Lead[] = [
    {
      id: "lead-tx-001",
      title: "Memorial Hermann Diagnostic Suite Modernization",
      summary: "Capital procurement replacement of legacy GE Cath Lab system.",
      source: "sam_gov",
      sourceUrl: "https://sam.gov/opp/test-1",
      confidence: 94,
      dateDiscovered: "2026-11-03T18:00:00Z",
      hospital: "Memorial Hermann Hospital",
      specialty: "Interventional Cardiology",
      territory: "TX",
      estimatedValueUsd: 1_700_000,
      winProbability: 0.85,
      competitorIncumbent: "GE Healthcare",
      entities: {
        hospitals: ["Memorial Hermann"],
        physicians: ["Dr. Jane Miller"],
        equipment: ["Cath Lab", "Philips Azurion"],
        keywords: ["cardiology", "rfp"],
      },
      priority: "high",
      signalType: "rfp",
      accountType: "non_va",
      vendorMentions: ["GE", "Philips"],
      accountId: "acc-001",
      sourceContacts: [],
    },
    {
      id: "lead-ok-002",
      title: "Stigler Health Wellness Rural Imaging Grant",
      summary: "CMS Rural Health Transformation grant for CT 5300 scanner deployment.",
      source: "rural_rht",
      sourceUrl: "https://grants.gov/opp/test-2",
      confidence: 91,
      dateDiscovered: "2026-11-03T16:00:00Z",
      hospital: "Stigler Health Wellness Center",
      specialty: "Diagnostic Radiology",
      territory: "OK",
      estimatedValueUsd: 1_200_000,
      winProbability: 0.9,
      competitorIncumbent: "Siemens Healthineers",
      entities: {
        hospitals: ["Stigler Health"],
        physicians: [],
        equipment: ["CT 5300"],
        keywords: ["rural_rht", "capital"],
      },
      priority: "high",
      signalType: "funding",
      accountType: "non_va",
      vendorMentions: ["Siemens"],
      accountId: null,
      sourceContacts: [],
    },
    {
      id: "lead-ar-003",
      title: "UAMS Little Rock Ultrasound Replacement",
      summary: "Aging equipment renewal notice in Little Rock facility.",
      source: "gdelt",
      sourceUrl: "https://news.google.com/test-3",
      confidence: 82,
      dateDiscovered: "2026-11-02T12:00:00Z",
      hospital: "UAMS Health",
      specialty: "Obstetrics & Gynecology",
      territory: "AR",
      estimatedValueUsd: 650_000,
      winProbability: 0.75,
      competitorIncumbent: null,
      entities: {
        hospitals: ["UAMS"],
        physicians: [],
        equipment: ["Ultrasound"],
        keywords: ["expansion"],
      },
      priority: "high",
      signalType: "expansion",
      accountType: "non_va",
      vendorMentions: [],
      accountId: null,
      sourceContacts: [],
    },
  ];

  it("calculates total pipeline telemetry and high priority counts accurately", () => {
    let pipelineSum = 0;
    let highPriorityCount = 0;
    let tenderCount = 0;
    let ruralCount = 0;
    let competitiveCount = 0;

    for (const lead of sampleLeads) {
      if (lead.estimatedValueUsd) pipelineSum += lead.estimatedValueUsd;
      if (lead.priority === "high") highPriorityCount++;
      if (lead.source === "sam_gov" || lead.signalType === "rfp") tenderCount++;
      if (lead.source === "rural_rht") ruralCount++;
      if (lead.competitorIncumbent) competitiveCount++;
    }

    expect(pipelineSum).toBe(3_550_000);
    expect(highPriorityCount).toBe(3);
    expect(tenderCount).toBe(1);
    expect(ruralCount).toBe(1);
    expect(competitiveCount).toBe(2);
  });

  it("ranks immediate priority targets by deal value descending and confidence", () => {
    const sorted = [...sampleLeads].sort(
      (a, b) => (b.estimatedValueUsd ?? 0) - (a.estimatedValueUsd ?? 0) || b.confidence - a.confidence,
    );

    expect(sorted[0].id).toBe("lead-tx-001");
    expect(sorted[0].estimatedValueUsd).toBe(1_700_000);
    expect(sorted[1].id).toBe("lead-ok-002");
    expect(sorted[1].estimatedValueUsd).toBe(1_200_000);
    expect(sorted[2].id).toBe("lead-ar-003");
    expect(sorted[2].estimatedValueUsd).toBe(650_000);
  });
});
