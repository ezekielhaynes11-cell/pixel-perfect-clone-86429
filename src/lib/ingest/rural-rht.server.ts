import { z } from "zod";
import { logWarn } from "../logger.server";
import { sanitizeErrorText } from "./medical-gate";
import type { LeadContact, RawLead } from "./types";

const USASPENDING_URL = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const GRANTS_GOV_URL = "https://api.grants.gov/v1/api/search2";
const CMS_HOSPITALS_URL = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0";

const REQUEST_TIMEOUT_MS = 9_000;
const USER_AGENT = "YieldArchitect/1.0 (PhilipsRuralHealthTransformation)";
const TERRITORY_STATES = ["TX", "OK", "AR", "LA"] as const;

const STATE_NAME_BY_CODE: Record<string, string> = {
  TX: "Texas",
  OK: "Oklahoma",
  AR: "Arkansas",
  LA: "Louisiana",
};

const STATE_RHT_CONTEXT: Record<string, string> = {
  TX: "Texas CMS RHTP (~$281M Yr-1 / $1.4B+ multi-year Rural Texas Strong allocation)",
  OK: "Oklahoma CMS RHTP ($150M-$230M Yr-1 rural hospital & telehealth modernization pool)",
  AR: "Arkansas CMS RHTP ($150M-$230M Yr-1 rural access & hub-and-spoke command center pool)",
  LA: "Louisiana CMS RHTP ($150M-$230M Yr-1 rural maternal & critical care infrastructure pool)",
};

const NON_HEALTHCARE_RECIPIENT_RX =
  /\b(independent\s+school|school\s+district|\bisd\b|head\s+start|child\s+care|housing\s+authority|food\s+bank|navigators?\s+in\s+federally|aids\s+arms|community\s+action\s+agency)\b/i;

const usaGrantRowSchema = z
  .object({
    "Award ID": z.string().nullish(),
    "Recipient Name": z.string().nullish(),
    "Start Date": z.string().nullish(),
    "End Date": z.string().nullish(),
    "Award Amount": z.number().nullish(),
    "Awarding Agency": z.string().nullish(),
    "Awarding Sub Agency": z.string().nullish(),
    Description: z.string().nullish(),
    "Place of Performance State Code": z.string().nullish(),
    "Place of Performance City Code": z.string().nullish(),
    generated_internal_id: z.string().nullish(),
  })
  .passthrough();

const usaGrantResponseSchema = z.object({
  results: z.array(usaGrantRowSchema).default([]),
});

const grantsGovHitSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    number: z.string().nullish(),
    title: z.string().nullish(),
    agencyCode: z.string().nullish(),
    agencyName: z.string().nullish(),
    openDate: z.string().nullish(),
    closeDate: z.string().nullish(),
    oppStatus: z.string().nullish(),
  })
  .passthrough();

const grantsGovResponseSchema = z.object({
  data: z
    .object({
      oppHits: z.array(grantsGovHitSchema).nullish(),
    })
    .nullish(),
});

const cmsHospitalRowSchema = z
  .object({
    facility_id: z.string().nullish(),
    facility_name: z.string().nullish(),
    address: z.string().nullish(),
    citytown: z.string().nullish(),
    state: z.string().nullish(),
    zip_code: z.string().nullish(),
    countyparish: z.string().nullish(),
    telephone_number: z.string().nullish(),
    hospital_type: z.string().nullish(),
    hospital_ownership: z.string().nullish(),
    emergency_services: z.string().nullish(),
    hospital_overall_rating: z.string().nullish(),
  })
  .passthrough();

const cmsHospitalResponseSchema = z.object({
  results: z.array(cmsHospitalRowSchema).default([]),
});

function formatCmsPhone(rawPhone: string | null | undefined): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return rawPhone.trim() || null;
}

function toTitleCaseHospital(rawName: string): string {
  const acronyms = new Set(["CAH", "REH", "EMS", "ICU", "ER", "TX", "OK", "AR", "LA", "II", "III"]);
  return rawName
    .trim()
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (acronyms.has(bare)) return bare;
      const lower = word.toLowerCase();
      if (lower === "of" || lower === "and" || lower === "at" || lower === "in") return lower;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function selectRuralPortfolioPitch(text: string, stateCode: string): string {
  const lower = text.toLowerCase();
  if (/\b(maternal|obstet|perinatal|prenatal|infant|birth|women)\b/.test(lower)) {
    return "Philips Rural Maternal & Perinatal Track: Avalon beltless/wireless fetal monitoring, IntelliSpace Perinatal, Lumify with Reacts tele-ultrasound, and EarlyVue VS30 (benchmark: Michigan DHHS 32,000 rural families reached).";
  }
  if (/\b(telehealth|telemedicine|workforce|network|command|icu|critical\s+care)\b/.test(lower)) {
    const benchmark =
      stateCode === "AR"
        ? "Arkansas Children's Hospital ROCC (73 cardiac MRIs/CTs in Year 1)"
        : "Arkansas Children's ROCC & Emory Healthcare eICU (2.1% 60-day readmission reduction)";
    return `Philips Virtual Specialist & Hub-and-Spoke Track: Radiology Operations Command Center (ROCC), eCareManager / eICU, and Telemetry Monitor 5500 (${benchmark}).`;
  }
  return "Philips Rural Diagnostic & Inpatient Modernization Track: BlueSeal Mobile 1.5T helium-free MRI, CT 5300 with AI Smart Workflow, Radiology Operations Command Center (ROCC), eICU, and EarlyVue VS30 EWS.";
}

export async function fetchRuralFederalGrants(
  opts: {
    daysBack?: number;
    limit?: number;
  } = {},
): Promise<RawLead[]> {
  const { daysBack = 540, limit = 25 } = opts;
  const startDate = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
  const endDate = new Date().toISOString().slice(0, 10);

  const response = await fetch(USASPENDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      fields: [
        "Award ID",
        "Recipient Name",
        "Start Date",
        "End Date",
        "Award Amount",
        "Awarding Agency",
        "Awarding Sub Agency",
        "Description",
        "Place of Performance State Code",
        "Place of Performance City Code",
        "generated_internal_id",
      ],
      filters: {
        award_type_codes: ["02", "03", "04", "05"],
        agencies: [
          { type: "awarding", tier: "toptier", name: "Department of Health and Human Services" },
        ],
        keywords: [
          "rural health",
          "critical access hospital",
          "rural hospital",
          "telehealth",
          "maternal health",
          "Rural Health Transformation",
        ],
        place_of_performance_locations: TERRITORY_STATES.map((state) => ({
          country: "USA",
          state,
        })),
        time_period: [{ start_date: startDate, end_date: endDate }],
      },
      limit: Math.min(Math.max(limit, 10), 40),
      page: 1,
      sort: "Start Date",
      order: "desc",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `USASpending rural grants ${response.status}: ${sanitizeErrorText(await response.text())}`,
    );
  }

  const parsed = usaGrantResponseSchema.parse(await response.json());
  const leads: RawLead[] = [];

  for (const row of parsed.results) {
    const stateCode = (row["Place of Performance State Code"] ?? "").trim().toUpperCase();
    const recipient = (row["Recipient Name"] ?? "").trim();
    const description = (row.Description ?? "").replace(/\s+/g, " ").trim();
    const amount = row["Award Amount"] ?? 0;

    if (!STATE_NAME_BY_CODE[stateCode] || !recipient) continue;
    if (NON_HEALTHCARE_RECIPIENT_RX.test(`${recipient} ${description}`)) continue;
    if (amount > 0 && amount < 75_000) continue;

    const internalId = (row.generated_internal_id ?? row["Award ID"] ?? "").trim();
    if (!internalId) continue;

    const hospitalLabel = toTitleCaseHospital(recipient);
    const amountText =
      amount > 0 ? `$${Math.round(amount).toLocaleString("en-US")}` : "CMS/HHS Grant";
    const pitch = selectRuralPortfolioPitch(`${recipient} ${description}`, stateCode);
    const stateName = STATE_NAME_BY_CODE[stateCode];
    const city = toTitleCaseHospital(row["Place of Performance City Code"] ?? "");

    leads.push({
      source: "rural_rht",
      source_external_id: `rht-grant:${internalId}`,
      source_url: row.generated_internal_id
        ? `https://www.usaspending.gov/award/${encodeURIComponent(row.generated_internal_id)}`
        : "https://www.usaspending.gov/search",
      title:
        `${hospitalLabel} (${stateCode}) — ${amountText} Rural Health Grant: ${description.slice(0, 130)}`.slice(
          0,
          280,
        ),
      raw_text: [
        `Hospital: ${hospitalLabel}`,
        `State: ${stateName} (${stateCode})`,
        `Location: ${[city, stateCode].filter(Boolean).join(", ")}`,
        `Campaign: $50B CMS Rural Health Transformation (RHT) & HHS Rural Grant`,
        `State RHT Envelope: ${STATE_RHT_CONTEXT[stateCode]}`,
        `Award $: ${amountText}`,
        `Agency: ${row["Awarding Sub Agency"] ?? row["Awarding Agency"] ?? "HHS"}`,
        `Grant Scope: ${description}`,
        `Philips Fit: ${pitch}`,
      ].join("\n"),
      date_discovered: row["Start Date"]
        ? new Date(`${row["Start Date"]}T00:00:00Z`).toISOString()
        : new Date().toISOString(),
      raw_payload: row as Record<string, unknown>,
    });
  }

  return leads;
}

export async function fetchRuralGrantsGovOpportunities(limit = 6): Promise<RawLead[]> {
  const response = await fetch(GRANTS_GOV_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      keyword: '"rural health" "hospital"',
      agencies: "HHS",
      oppStatuses: "forecasted|posted",
      rows: limit,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) return [];
  const parsed = grantsGovResponseSchema.parse(await response.json());
  const hits = parsed.data?.oppHits ?? [];

  return hits
    .filter((hit) => Boolean(hit.title))
    .slice(0, limit)
    .map((hit): RawLead => {
      const oppId = String(hit.id);
      const numberLabel = hit.number ? `${hit.number} — ` : "";
      const titleText = `${numberLabel}${hit.title ?? "Rural Health Funding Opportunity"}`;
      return {
        source: "rural_rht",
        source_external_id: `grants-gov:${oppId}`,
        source_url: `https://www.grants.gov/search-results-detail/${encodeURIComponent(oppId)}`,
        title: `CMS / HHS Rural Funding Window (TX/OK/AR/LA Eligible): ${titleText}`.slice(0, 280),
        raw_text: [
          `Agency: ${hit.agencyName ?? hit.agencyCode ?? "HHS / HRSA / CMS"}`,
          `State: Texas (TX), Oklahoma (OK), Arkansas (AR), Louisiana (LA)`,
          `Campaign: $50B CMS Rural Health Transformation (RHT) & Federal Rural Grant Window`,
          `Opportunity: ${titleText}`,
          `Status: ${hit.oppStatus ?? "posted"} (Closes: ${hit.closeDate ?? "open"})`,
          `Philips Fit: Position BlueSeal Mobile 1.5T MRI, CT 5300, ROCC, eICU, Avalon/Lumify, and EarlyVue VS30 in TX/OK/AR/LA hospital grant budgets before close date.`,
        ].join("\n"),
        date_discovered: new Date().toISOString(),
        raw_payload: hit as Record<string, unknown>,
      };
    });
}

async function fetchCahsForState(stateCode: string, perState: number): Promise<RawLead[]> {
  const params = new URLSearchParams({
    limit: String(perState),
    "conditions[0][property]": "state",
    "conditions[0][value]": stateCode,
    "conditions[0][operator]": "=",
    "conditions[1][property]": "hospital_type",
    "conditions[1][value]": "Critical Access Hospitals",
    "conditions[1][operator]": "=",
  });

  const response = await fetch(`${CMS_HOSPITALS_URL}?${params.toString()}`, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return [];

  const parsed = cmsHospitalResponseSchema.parse(await response.json());
  const prioritized = [...parsed.results].sort(
    (a, b) => Number(b.emergency_services === "Yes") - Number(a.emergency_services === "Yes"),
  );

  return prioritized.slice(0, perState).map((row): RawLead => {
    const ccn = (row.facility_id ?? "").trim();
    const rawFacility = (row.facility_name ?? "Critical Access Hospital").trim();
    const hospitalName = toTitleCaseHospital(rawFacility);
    const city = toTitleCaseHospital(row.citytown ?? "");
    const county = toTitleCaseHospital(row.countyparish ?? "");
    const phone = formatCmsPhone(row.telephone_number);
    const address = [row.address, city, stateCode, row.zip_code].filter(Boolean).join(", ");
    const stateName = STATE_NAME_BY_CODE[stateCode] ?? stateCode;
    const hasEd = row.emergency_services === "Yes";

    const contacts: LeadContact[] = phone
      ? [
          {
            name: `${hospitalName} Administration & Clinical Operations`,
            title: "Critical Access Hospital Switchboard / Executive Office",
            organization: hospitalName,
            phone,
            email: null,
            address: address || null,
            type: "primary",
            source_origin: "rural_rht",
          },
        ]
      : [];

    const pitch = selectRuralPortfolioPitch(
      hasEd ? "telehealth critical care command icu" : "diagnostic imaging",
      stateCode,
    );

    return {
      source: "rural_rht",
      source_external_id: `cms-cah:${ccn || rawFacility.toLowerCase().replace(/\W+/g, "-")}`,
      source_url: ccn
        ? `https://www.medicare.gov/care-compare/details/hospital/${encodeURIComponent(ccn)}`
        : "https://data.cms.gov/provider-data/dataset/xubh-q36u",
      title:
        `${hospitalName} (${city}, ${stateCode}) — CMS RHT Critical Access Hospital Modernization Target`.slice(
          0,
          280,
        ),
      raw_text: [
        `Hospital: ${hospitalName}`,
        `State: ${stateName} (${stateCode})`,
        `Location: ${city}, ${county ? `${county} County, ` : ""}${stateCode}`,
        `Facility Type: CMS Critical Access Hospital (CCN ${ccn || "verified"})${hasEd ? " · 24/7 Emergency Services" : ""}`,
        `Ownership: ${row.hospital_ownership ?? "Community Rural Hospital"}`,
        `Campaign: $50B CMS Rural Health Transformation (RHT) Program Eligible Facility`,
        `State RHT Envelope: ${STATE_RHT_CONTEXT[stateCode]}`,
        `Philips Fit: ${pitch}`,
      ].join("\n"),
      date_discovered: new Date().toISOString(),
      raw_payload: row as Record<string, unknown>,
      source_contacts: contacts,
    };
  });
}

export async function fetchRuralRht(
  opts: {
    grantLimit?: number;
    cahPerState?: number;
  } = {},
): Promise<RawLead[]> {
  const { grantLimit = 25, cahPerState = 12 } = opts;

  const [grantsSettled, ffoSettled, ...cahSettled] = await Promise.allSettled([
    fetchRuralFederalGrants({ limit: grantLimit }),
    fetchRuralGrantsGovOpportunities(5),
    ...TERRITORY_STATES.map((st) => fetchCahsForState(st, cahPerState)),
  ]);

  const combined: RawLead[] = [];
  if (grantsSettled.status === "fulfilled") {
    combined.push(...grantsSettled.value);
  } else {
    logWarn("ingest.rural_rht", "USASpending rural grant stream failed", {
      error:
        grantsSettled.reason instanceof Error
          ? grantsSettled.reason.message
          : String(grantsSettled.reason),
    });
  }

  if (ffoSettled.status === "fulfilled") {
    combined.push(...ffoSettled.value);
  } else {
    logWarn("ingest.rural_rht", "Grants.gov rural opportunity stream failed", {
      error:
        ffoSettled.reason instanceof Error ? ffoSettled.reason.message : String(ffoSettled.reason),
    });
  }

  for (const stateOutcome of cahSettled) {
    if (stateOutcome.status === "fulfilled") {
      combined.push(...stateOutcome.value);
    }
  }

  return combined;
}
