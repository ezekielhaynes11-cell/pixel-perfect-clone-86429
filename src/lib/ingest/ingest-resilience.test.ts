import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyLeadType,
  compareLeadsByPriorityAndRecency,
  isArchivedLead,
  isDiscoveredToday,
  isRuralCampaignLead,
  leadInTerritoryScope,
  leadIsHighPriority,
  leadMatchesDateFilter,
  normalizePhysicianStrings,
  rowToLead,
  sortLeads,
  type LeadRow,
} from "@/data/leads";
import { fetchClinicalTrialContacts, hospitalsMatch } from "@/lib/apollo/public-enrichment.server";
import { defaultToneForLead, draftOutreachEmail } from "@/lib/outreach.server";
import { buildBlueskySearchQuery } from "./bluesky.server";
import { deterministicEnrichRawLead } from "./deterministic-enrich.server";
import { enrichRawLead } from "./enrich.server";
import { passesMedicalGate, sanitizeErrorText } from "./medical-gate";
import { fetchRuralRht } from "./rural-rht.server";
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

  it("cascades to NIH RePORTER federal awards when USASpending.gov times out on Worker egress", async () => {
    const nihPayload = {
      results: [
        {
          appl_id: 11203945,
          project_num: "1R01HL172001-01",
          project_title: "Point-of-Care Cardiac Ultrasound and Hemodynamic Monitoring in ICU",
          abstract_text: "Deploying bedside echocardiography and telemetry across Houston ICUs.",
          award_amount: 685000,
          award_notice_date: "2026-10-25T00:00:00Z",
          organization: {
            org_name: "METHODIST HOSPITAL RESEARCH INSTITUTE",
            org_city: "HOUSTON",
            org_state: "TX",
          },
          principal_investigators: [
            {
              full_name: "Elena Vance, MD",
              title: "Director of Critical Care Echocardiography",
              is_contact_pi: true,
            },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url === "https://api.usaspending.gov/api/v2/search/spending_by_award/") {
        const timeoutErr = new Error("The operation was aborted due to timeout");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      }
      if (url === "https://api.reporter.nih.gov/v2/projects/search") {
        return new Response(JSON.stringify(nihPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected URL in test: ${url}`);
    });

    const leads = await fetchSamGov({});

    expect(leads).toHaveLength(1);
    expect(leads[0].source).toBe("sam_gov");
    expect(leads[0].source_external_id).toBe("nih:11203945");
    expect(leads[0].title).toContain("METHODIST HOSPITAL RESEARCH INSTITUTE (TX)");
    expect(leads[0].raw_text).toContain("Texas (TX)");
    expect(leads[0].source_contacts?.[0]?.name).toBe("Elena Vance, MD");
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
    "Hocus Pocus by Focus — prog rock never fails",
    "PECHAR Halloween Shirts Women Hocus Pocus Shirt I Smell Children Tee Tops",
  ])("blocks non-medical noise: %s", (text) => {
    expect(passesMedicalGate(makeBlueskyLead(text), extraKeywords)).toBe(false);
  });

  it("ignores synthetic Query metadata lines when evaluating medical gate", () => {
    const noisyWithQueryLine = makeBlueskyLead(
      "It's a labor of love! But now it's time to hibernate until next year",
      "Author: Test (@test)\nQuery: \"Philips\" ultrasound\n\nIt's a labor of love! But now it's time to hibernate until next year",
    );
    expect(passesMedicalGate(noisyWithQueryLine, extraKeywords)).toBe(false);
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

describe("historical lead archiving, high-priority qualification, and territory scoping", () => {
  const territoryStates = new Set(["TX", "OK", "AR", "LA"]);

  function buildLeadRow(overrides: Partial<LeadRow>): LeadRow {
    return {
      id: "lead-1",
      title: "Diagnostic Imaging Fleet Upgrade",
      summary: "Hospital evaluating ultrasound and patient monitoring replacement.",
      source: "openfda",
      source_url: "https://example.com/lead",
      confidence: 75,
      date_discovered: "2026-10-30T12:00:00Z",
      date_ingested: "2026-10-30T15:00:00Z",
      hospital: "UT Southwestern Medical Center",
      specialty: "Cardiology",
      territory: "texas",
      estimated_value_usd: 500_000,
      win_probability: 0.45,
      competitor_incumbent: "Nihon Kohden",
      signal_type: "recall",
      priority: "high",
      entities: {},
      ...overrides,
    };
  }

  it("archives leads from the original historical pulls (>30 days old) while keeping recent leads active", () => {
    const nowMs = new Date("2026-10-30T18:00:00Z").getTime();
    const originalPullLead = rowToLead(
      buildLeadRow({
        id: "old-may-lead",
        date_discovered: "2026-05-24T10:00:00Z",
        date_ingested: "2026-06-02T10:00:00Z",
      }),
    );
    const freshLead = rowToLead(
      buildLeadRow({
        id: "fresh-october-lead",
        date_discovered: "2026-10-29T10:00:00Z",
        date_ingested: "2026-10-30T14:00:00Z",
      }),
    );

    expect(isArchivedLead(originalPullLead, nowMs)).toBe(true);
    expect(isArchivedLead(freshLead, nowMs)).toBe(false);
  });

  it("qualifies actionable newer recalls, RFPs, and expansions as high priority and sorts them first", () => {
    const newerHighPriorityRecall = rowToLead(
      buildLeadRow({
        id: "recall-high",
        confidence: 75,
        signal_type: "recall",
        estimated_value_usd: 500_000,
        priority: "medium",
        date_ingested: "2026-10-30T16:00:00Z",
      }),
    );
    const routineSentimentLead = rowToLead(
      buildLeadRow({
        id: "sentiment-low",
        confidence: 78,
        signal_type: "sentiment",
        estimated_value_usd: 50_000,
        priority: "low",
        date_ingested: "2026-10-30T17:00:00Z",
      }),
    );

    expect(leadIsHighPriority(newerHighPriorityRecall)).toBe(true);
    expect(leadIsHighPriority(routineSentimentLead)).toBe(false);

    const sorted = [routineSentimentLead, newerHighPriorityRecall].sort(
      compareLeadsByPriorityAndRecency,
    );
    expect(sorted[0].id).toBe("recall-high");
  });

  it("includes nationwide competitor recalls in territory scope while excluding explicit out-of-territory states", () => {
    const nationwideRecall = rowToLead(
      buildLeadRow({
        id: "nationwide-recall",
        signal_type: "recall",
        territory: null,
        hospital: "Canon Medical Systems",
      }),
    );
    const iowaRecall = rowToLead(
      buildLeadRow({
        id: "iowa-recall",
        signal_type: "recall",
        territory: "iowa",
        hospital: "University of Iowa Hospitals",
      }),
    );

    expect(leadInTerritoryScope(nationwideRecall, territoryStates)).toBe(true);
    expect(leadInTerritoryScope(iowaRecall, territoryStates)).toBe(false);
  });

  it("matches hospital aliases across ClinicalTrials.gov and seeded account names", () => {
    expect(
      hospitalsMatch("The University of Texas Southwestern", "UT Southwestern Medical Center"),
    ).toBe(true);
    expect(
      hospitalsMatch(
        "The University of Texas Health Science Center at Houston",
        "UTHealth Houston McGovern Medical School",
      ),
    ).toBe(true);
    expect(hospitalsMatch("Methodist Dallas Medical Center", "University of Iowa Hospitals")).toBe(
      false,
    );
  });

  it("extracts territory contacts and principal investigators from ClinicalTrials.gov v2 studies", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          protocolSection: {
            contactsLocationsModule: {
              locations: [
                {
                  facility: "The University of Texas Southwestern",
                  city: "Dallas",
                  state: "Texas",
                  zip: "75390",
                  contacts: [
                    {
                      name: "Riley Martin",
                      role: "CONTACT",
                      phone: "214-648-2147",
                      email: "riley.martin@utsouthwestern.edu",
                    },
                  ],
                },
              ],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const contacts = await fetchClinicalTrialContacts(
      "NCT07853768",
      "The University of Texas Southwestern",
    );
    expect(contacts).toHaveLength(1);
    expect(contacts[0].name).toBe("Riley Martin");
    expect(contacts[0].email).toBe("riley.martin@utsouthwestern.edu");
    expect(contacts[0].phone).toBe("214-648-2147");
  });
});

describe("deterministic clinical enrichment fallback when AI gateway is unavailable", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("enriches TX/OK/AR/LA hospital awards into high-priority leads when AI gateway returns 402", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "exhausted-gateway-key");
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () => new Response(JSON.stringify({ error: "Payment Required" }), { status: 402 }),
    );

    const rawAward: RawLead = {
      source: "sam_gov",
      source_external_id: "nih:11299881",
      source_url: "https://reporter.nih.gov/project-details/11299881",
      title:
        "UT SOUTHWESTERN MEDICAL CENTER (TX) — $692,660: IDENTIFYING SUBCLINICAL TRANSTHYRETIN CARDIAC AMYLOIDOSIS IN ECHOCARDIOGRAPHY",
      raw_text: [
        "Hospital/Agency: UT SOUTHWESTERN MEDICAL CENTER",
        "State: Texas (TX)",
        "Place of Performance: DALLAS, Texas",
        "Award $: $692,660",
        "Title: IDENTIFYING SUBCLINICAL TRANSTHYRETIN CARDIAC AMYLOIDOSIS IN ECHOCARDIOGRAPHY",
      ].join("\n"),
      date_discovered: "2026-11-02T00:00:00Z",
      raw_payload: {},
      source_contacts: [
        {
          name: "Justin Grodin, MD",
          title: "Principal Investigator",
          organization: "UT Southwestern Medical Center",
          phone: null,
          email: null,
          address: "Dallas, TX",
        },
      ],
    };

    const enriched = await enrichRawLead(rawAward);
    expect(enriched.confidence).toBeGreaterThanOrEqual(85);
    expect(enriched.priority).toBe("high");
    expect(enriched.hospital).toBe("UT Southwestern Medical Center");
    expect(enriched.territory).toBe("texas");
    expect(enriched.signal_type).toBe("funding");
    expect(enriched.specialty).toBe("Cardiology");
    expect(enriched.estimated_value_usd).toBe(692_660);
    expect(enriched.entities.physicians[0]?.name).toBe("Justin Grodin, MD");
  });

  it("scores off-topic Halloween / Hocus Pocus social chatter below the 35 qualification floor", () => {
    const hocusPocusNoise: RawLead = {
      source: "bluesky",
      source_external_id: "bsky:hocus-1",
      source_url: "https://bsky.app/profile/music/post/1",
      title: "Hocus Pocus by Focus — prog rock never fails",
      raw_text: "Hocus Pocus by Focus — prog rock never fails",
      date_discovered: "2026-11-02T12:00:00Z",
      raw_payload: {},
    };

    const result = deterministicEnrichRawLead(hocusPocusNoise);
    expect(result.confidence).toBeLessThan(35);
    expect(result.priority).toBe("low");
  });
});

describe("CMS $50B Rural Health Transformation (rural_rht) ingestion, enrichment, and outreach", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("ingests HHS rural grants, Grants.gov windows, and CMS Critical Access Hospitals while rejecting K-12 ISDs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

      if (url === "https://api.usaspending.gov/api/v2/search/spending_by_award/") {
        return new Response(
          JSON.stringify({
            results: [
              {
                "Award ID": "H54RH00099",
                "Recipient Name": "CABUN RURAL HEALTH SERVICES, INC.",
                "Start Date": "2026-10-20",
                "End Date": "2027-09-30",
                "Award Amount": 1_850_000,
                "Awarding Agency": "Department of Health and Human Services",
                "Awarding Sub Agency": "Health Resources and Services Administration",
                Description:
                  "RURAL HOSPITAL MATERNAL PERINATAL TELEHEALTH AND DIAGNOSTIC MODERNIZATION",
                "Place of Performance State Code": "AR",
                "Place of Performance City Code": "HAMPTON",
                generated_internal_id: "ASST_NON_H54RH00099_7526",
              },
              {
                "Award ID": "SCH001",
                "Recipient Name": "BROWNSVILLE INDEPENDENT SCHOOL DISTRICT",
                "Start Date": "2026-10-18",
                "Award Amount": 500_000,
                Description: "SCHOOL COUNSELING",
                "Place of Performance State Code": "TX",
                generated_internal_id: "ASST_NON_SCH001",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url === "https://api.grants.gov/v1/api/search2") {
        return new Response(
          JSON.stringify({
            data: {
              oppHits: [
                {
                  id: "358901",
                  number: "HRSA-26-088",
                  title: "Rural Critical Access Hospital Tele-ICU and Diagnostic Readiness",
                  agencyCode: "HHS-HRSA",
                  oppStatus: "posted",
                  closeDate: "2026-12-15",
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.startsWith("https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0")) {
        const parsedUrl = new URL(url);
        const stateCode = parsedUrl.searchParams.get("conditions[0][value]") ?? "TX";
        if (stateCode === "LA") {
          return new Response(
            JSON.stringify({
              results: [
                {
                  facility_id: "191306",
                  facility_name: "BUNKIE GENERAL HOSPITAL",
                  address: "427 EVERGREEN ST",
                  citytown: "BUNKIE",
                  state: "LA",
                  zip_code: "71322",
                  countyparish: "AVOYELLES",
                  telephone_number: "(318) 346-6681",
                  hospital_type: "Critical Access Hospitals",
                  emergency_services: "Yes",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (stateCode !== "TX") {
          return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            results: [
              {
                facility_id: "451301",
                facility_name: "BIG BEND REGIONAL MEDICAL CENTER",
                address: "2600 N HIGHWAY 118",
                citytown: "ALPINE",
                state: "TX",
                zip_code: "79830",
                countyparish: "BREWSTER",
                telephone_number: "(432) 837-3447",
                hospital_type: "Critical Access Hospitals",
                emergency_services: "Yes",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      throw new Error(`Unexpected URL in rural_rht test: ${url}`);
    });

    const rawLeads = await fetchRuralRht({ grantLimit: 10, cahPerState: 2 });
    expect(rawLeads).toHaveLength(4);

    const grantLead = rawLeads.find((item) => item.source_external_id.startsWith("rht-grant:"));
    const ffoLead = rawLeads.find((item) => item.source_external_id.startsWith("grants-gov:"));
    const cahLead = rawLeads.find((item) => item.source_external_id === "cms-cah:451301");
    const laCahLead = rawLeads.find((item) => item.source_external_id === "cms-cah:191306");

    expect(grantLead?.title).toContain("Cabun Rural Health Services, Inc. (AR)");
    expect(ffoLead?.title).toContain("HRSA-26-088");
    expect(cahLead?.source_contacts?.[0]?.phone).toBe("432-837-3447");
    expect(deterministicEnrichRawLead(laCahLead!).territory).toBe("louisiana");

    const enrichedGrant = deterministicEnrichRawLead(grantLead!);
    expect(enrichedGrant.confidence).toBe(88);
    expect(enrichedGrant.priority).toBe("high");
    expect(enrichedGrant.territory).toBe("arkansas");
    expect(enrichedGrant.estimated_value_usd).toBe(1_850_000);
    expect(enrichedGrant.entities.equipment).toContain("Avalon & Lumify Perinatal");

    const enrichedCah = deterministicEnrichRawLead(cahLead!);
    expect(enrichedCah.confidence).toBe(85);
    expect(enrichedCah.priority).toBe("high");
    expect(enrichedCah.territory).toBe("texas");
    expect(enrichedCah.signal_type).toBe("expansion");
    expect(enrichedCah.entities.equipment).toContain("ROCC Remote Scanning");
    expect(enrichedCah.entities.equipment).toContain("eICU / eCareManager");
  });

  it("drafts benchmark-backed CMS $50B RHT outreach when LOVABLE_API_KEY is unset", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("GOOGLE_CLOUD_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    const leadBrief = {
      title: "Big Bend Regional Medical Center (Alpine, TX) — CMS RHT Critical Access Hospital",
      summary: "Verified Critical Access Hospital eligible for Texas $50B CMS RHT modernization.",
      hospital: "Big Bend Regional Medical Center",
      specialty: "Radiology",
      source: "rural_rht",
      signal_type: "expansion",
      entities: {
        equipment: ["BlueSeal Mobile 1.5T MRI", "ROCC Remote Scanning"],
      },
    };

    expect(defaultToneForLead(leadBrief)).toBe("rht_grant_pitch");
    const email = await draftOutreachEmail({
      lead: leadBrief,
      repName: "Mike Rivera",
    });

    expect(email.subject).toContain("CMS $50B Rural Health Transformation");
    expect(email.body).toContain("Big Bend Regional Medical Center");
    expect(email.body).toContain("Project EDDY");
    expect(email.body).toContain("Mike Rivera");
  });
});

describe("date presets, custom date range, lead type classification, and sorting", () => {
  const anchorMs = new Date("2026-11-03T15:00:00Z").getTime();

  function makeFilterLead(overrides: Partial<LeadRow>) {
    return rowToLead({
      id: "lead-base",
      title: "Hospital Equipment Signal",
      summary: "Clinical expansion",
      source: "clinicaltrials",
      source_url: "https://clinicaltrials.gov/study/NCT1",
      confidence: 80,
      date_discovered: "2026-11-01T12:00:00Z",
      date_ingested: "2026-11-03T12:00:00Z",
      hospital: "Baylor University Medical Center",
      specialty: "Cardiology",
      territory: "texas",
      estimated_value_usd: 400_000,
      win_probability: 0.25,
      competitor_incumbent: null,
      signal_type: "expansion",
      priority: "medium",
      entities: {
        physicians: [{ name: "Dr. Sarah Lin", role_hint: "Cardiology Chair" }],
        equipment: ["Echocardiography"],
      },
      ...overrides,
    });
  }

  it("classifies rural_rht, recall, rfp, grant, competitive, and expansion lead types accurately", () => {
    const ruralLead = makeFilterLead({
      id: "rural-1",
      source: "rural_rht",
      signal_type: "funding",
      estimated_value_usd: 950_000,
    });
    const recallLead = makeFilterLead({
      id: "recall-1",
      source: "openfda",
      signal_type: "recall",
      estimated_value_usd: 450_000,
    });
    const rfpLead = makeFilterLead({
      id: "rfp-1",
      source: "sam_gov",
      signal_type: "rfp",
      estimated_value_usd: 1_200_000,
    });
    const trialLead = makeFilterLead({
      id: "trial-1",
      source: "clinicaltrials",
      signal_type: "expansion",
      estimated_value_usd: 300_000,
    });

    expect(isRuralCampaignLead(ruralLead)).toBe(true);
    expect(classifyLeadType(ruralLead)).toBe("rural_rht");
    expect(classifyLeadType(recallLead)).toBe("fda_recall");
    expect(classifyLeadType(rfpLead)).toBe("rfp_procurement");
    expect(classifyLeadType(trialLead)).toBe("expansion_trial");
    expect(normalizePhysicianStrings([{ name: "Dr. Sarah Lin", role_hint: "Chair" }])).toEqual([
      "Dr. Sarah Lin (Chair)",
    ]);
  });

  it("filters accurately by rolling date presets and custom YYYY-MM-DD bounds and sorts by value/newest", () => {
    const todayLead = makeFilterLead({
      id: "today",
      date_ingested: "2026-11-03T13:00:00Z",
      estimated_value_usd: 450_000,
    });
    const fiveDaysAgoLead = makeFilterLead({
      id: "five-days",
      date_discovered: "2026-10-29T12:00:00Z",
      date_ingested: "2026-10-29T14:00:00Z",
      estimated_value_usd: 1_900_000,
    });
    const twentyDaysAgoLead = makeFilterLead({
      id: "twenty-days",
      date_discovered: "2026-10-14T12:00:00Z",
      date_ingested: "2026-10-14T14:00:00Z",
      estimated_value_usd: 750_000,
    });

    expect(
      leadMatchesDateFilter(
        todayLead,
        { onlyToday: false, datePreset: "3d", dateFrom: "", dateTo: "" },
        anchorMs,
      ),
    ).toBe(true);
    expect(
      leadMatchesDateFilter(
        fiveDaysAgoLead,
        { onlyToday: false, datePreset: "3d", dateFrom: "", dateTo: "" },
        anchorMs,
      ),
    ).toBe(false);
    expect(
      leadMatchesDateFilter(
        fiveDaysAgoLead,
        { onlyToday: false, datePreset: "7d", dateFrom: "", dateTo: "" },
        anchorMs,
      ),
    ).toBe(true);
    expect(
      leadMatchesDateFilter(
        twentyDaysAgoLead,
        {
          onlyToday: false,
          datePreset: "custom",
          dateFrom: "2026-10-10",
          dateTo: "2026-10-20",
        },
        anchorMs,
      ),
    ).toBe(true);
    expect(
      leadMatchesDateFilter(
        todayLead,
        {
          onlyToday: false,
          datePreset: "custom",
          dateFrom: "2026-10-10",
          dateTo: "2026-10-20",
        },
        anchorMs,
      ),
    ).toBe(false);

    const byValue = sortLeads([todayLead, fiveDaysAgoLead, twentyDaysAgoLead], "value");
    expect(byValue.map((item) => item.id)).toEqual(["five-days", "twenty-days", "today"]);

    const byNewest = sortLeads([twentyDaysAgoLead, fiveDaysAgoLead, todayLead], "newest");
    expect(byNewest.map((item) => item.id)).toEqual(["today", "five-days", "twenty-days"]);
  });
});
