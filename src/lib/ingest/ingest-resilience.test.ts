import { afterEach, describe, expect, it, vi } from "vitest";
import { isDiscoveredToday, rowToLead, type LeadRow } from "@/data/leads";
import { buildBlueskySearchQuery } from "./bluesky.server";
import { passesMedicalGate, sanitizeErrorText } from "./medical-gate";
import { fetchSamGov } from "./sam-gov.server";
import type { RawLead } from "./types";

const SAMPLE_USASPENDING_PAYLOAD = {
  results: [
    {
      "Award ID": "36C25627P0019",
      "Recipient Name": "GE PRECISION HEALTHCARE LLC",
      "Start Date": "2026-10-15",
      "End Date": "2027-10-14",
      "Award Amount": 1325786.76,
      "Awarding Agency": "Department of Veterans Affairs",
      "Awarding Sub Agency": "Department of Veterans Affairs",
      "Awarding Office": "Network Contracting Office 19",
      Description: "GE NAC CONTRACT PM FOR DIAGNOSTIC ULTRASOUND AND IMAGING",
      "Place of Performance State Code": "OK",
      "Place of Performance City Code": "OKLAHOMA CITY",
      generated_internal_id: "CONT_AWD_36C25627P0019_3600",
    },
    {
      "Award ID": "36C25727P0038",
      "Recipient Name": "ASCEND RESIDENTIAL ELEVATORS LLC",
      "Start Date": "2026-10-27",
      "End Date": "2027-03-31",
      "Award Amount": 15800,
      "Awarding Agency": "Department of Veterans Affairs",
      "Awarding Sub Agency": "Department of Veterans Affairs",
      Description: "STAIR LIFT INSTALLATION",
      "Place of Performance State Code": "TX",
      "Place of Performance City Code": "DALLAS",
      generated_internal_id: "CONT_AWD_36C25727P0038_3600",
    },
  ],
};

describe("SAM.gov resilient ingestion", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to USASpending.gov when SAM.gov returns 401 API_KEY_INVALID", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://api.sam.gov/")) {
        return new Response(
          "<html><body><h1>API_KEY_INVALID</h1><p>An invalid API key was supplied.</p></body></html>",
          { status: 401, headers: { "Content-Type": "text/html" } },
        );
      }
      if (url === "https://api.usaspending.gov/api/v2/search/spending_by_award/") {
        return new Response(JSON.stringify(SAMPLE_USASPENDING_PAYLOAD), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const leads = await fetchSamGov({ apiKey: "expired-sam-key" });

    expect(fetchMock).toHaveBeenCalled();
    expect(leads).toHaveLength(1);
    expect(leads[0].source).toBe("sam_gov");
    expect(leads[0].source_external_id).toBe("usaspending:CONT_AWD_36C25627P0019_3600");
    expect(leads[0].title).toContain("GE PRECISION HEALTHCARE LLC");
    expect(leads[0].raw_text).toContain("Oklahoma (OK)");
  });

  it("queries USASpending.gov directly when SAM_GOV_API_KEY is unset", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(SAMPLE_USASPENDING_PAYLOAD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const leads = await fetchSamGov({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(leads).toHaveLength(1);
    expect(leads[0].source_url).toBe(
      "https://www.usaspending.gov/award/CONT_AWD_36C25627P0019_3600",
    );
  });

  it("strips HTML tags if SAM.gov fails with a 500 upstream error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response("<html><body><h1>Service Unavailable</h1></body></html>", { status: 503 }),
    );

    await expect(fetchSamGov({ apiKey: "some-key" })).rejects.toThrow(
      "SAM.gov 503 (NAICS 339112): Service Unavailable",
    );
  });
});

describe("medical pre-enrichment gate and Bluesky query scoping", () => {
  const extraKeywords = [
    "Philips",
    "Samsung",
    "GE Healthcare",
    "Siemens Healthineers",
    "Venue",
    "LX",
    "PX",
    "Vivid E95",
  ];

  function makeBlueskyLead(title: string, rawText = title): RawLead {
    return {
      source: "bluesky",
      source_external_id: "bsky:test",
      source_url: "https://bsky.app/profile/test/post/1",
      title,
      raw_text: rawText,
      date_discovered: new Date().toISOString(),
      raw_payload: {},
    };
  }

  it.each([
    "Philips 2200 Series Fully Automatic Espresso Machine on sale",
    "Barbeador Elétrico Philips OneBlade review",
    "Totally agree with Jess Philips on parliament vote",
    "That concert venue was ridiculous and agreed by everyone",
    "Samsung Galaxy S25 Ultra camera test",
    "Shenzhen Mindray Animal Medical Technology submitted a veterinary NIBP module",
  ])("blocks non-medical noise: %s", (text) => {
    expect(passesMedicalGate(makeBlueskyLead(text), extraKeywords)).toBe(false);
  });

  it.each([
    "Emergency medicine fellowship evaluating Philips Lumify POCUS probes",
    "Memorial Hermann Hospital expanding cardiac cath lab in Houston TX",
    "Clinicians frustrated with Vivid E95 workflow in cardiology clinic",
    "VA Medical Center Oklahoma City upgrading diagnostic ultrasound fleet",
  ])("allows genuine clinical and healthcare equipment signals: %s", (text) => {
    expect(passesMedicalGate(makeBlueskyLead(text), extraKeywords)).toBe(true);
  });

  it("pairs ambiguous consumer-overlapping terms with ultrasound on Bluesky", () => {
    expect(buildBlueskySearchQuery("Philips")).toBe('"Philips" ultrasound');
    expect(buildBlueskySearchQuery("Venue")).toBe('"Venue" ultrasound');
    expect(buildBlueskySearchQuery("TE7")).toBe('"TE7" ultrasound');
    expect(buildBlueskySearchQuery("GE Healthcare")).toBe('"GE Healthcare"');
    expect(buildBlueskySearchQuery("LX")).toBeNull();
  });
});

describe("today discovery accounting and error sanitization", () => {
  it("counts a lead as discovered today when ingested today with an older event date", () => {
    const todayIso = new Date().toISOString();
    const row: LeadRow = {
      id: "e00fbb33-cebd-42ef-957b-8361aebf046d",
      title: "Class II — Competitor Patient Monitor Recall",
      summary: "FDA Class II recall affecting central monitoring stations",
      source: "openfda",
      source_url: "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=1",
      confidence: 75,
      date_discovered: "2026-09-08T00:00:00Z",
      date_ingested: todayIso,
      hospital: "Michael E. DeBakey VA Medical Center",
      specialty: "Cardiology",
      territory: "texas",
      estimated_value_usd: 300_000,
      win_probability: 0.4,
      competitor_incumbent: "Nihon Kohden",
      entities: {},
      priority: "high",
    };

    const lead = rowToLead(row);
    expect(lead.dateIngested).toBe(todayIso);
    expect(isDiscoveredToday(lead.dateDiscovered, lead.dateIngested)).toBe(true);
    expect(isDiscoveredToday("2025-01-10T00:00:00Z", "2025-01-11T00:00:00Z")).toBe(false);
  });

  it("strips HTML markup, credentials, and URLs from error messages", () => {
    const dirty =
      "sam_gov: SAM.gov 401: <html><body><h1>API_KEY_INVALID</h1></body></html> api_key=abc123 https://api.sam.gov/opportunities/v2/search";
    const clean = sanitizeErrorText(dirty);
    expect(clean).not.toContain("<html>");
    expect(clean).not.toContain("abc123");
    expect(clean).toContain("API_KEY_INVALID");
    expect(clean).toContain("api_key=***");
  });
});
