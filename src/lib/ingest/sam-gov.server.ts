import { z } from "zod";
import { logWarn } from "../logger.server";
import { sanitizeErrorText } from "./medical-gate";
import type { RawLead, LeadContact } from "./types";
import { PHILLIPS_KEYWORDS } from "./types";

const SAM_BASE = "https://api.sam.gov/opportunities/v2/search";
const USASPENDING_BASE = "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const REQUEST_TIMEOUT_MS = 25_000;

const TERRITORY_STATE_CODES = ["TX", "OK", "AR", "LA"] as const;

const TERRITORY_STATE_NAMES = new Set([
  "Texas",
  "Oklahoma",
  "Arkansas",
  "Louisiana",
  ...TERRITORY_STATE_CODES,
]);

const STATE_CODE_TO_NAME: Record<string, string> = {
  TX: "Texas",
  OK: "Oklahoma",
  AR: "Arkansas",
  LA: "Louisiana",
};

const USASPENDING_MEDICAL_SIGNAL_RX =
  /\b(ultrasound|sonograph|doppler|echocard|imaging|radiolog|mri|pet\/ct|ct\s+scan|x-ray|fluoroscop|cath|ivus|avvigo|ecg|ekg|monitor|ventilator|defibrillator|transducer|pacs|ge\s+precision|ge\s+healthcare|siemens\s+medical|siemens\s+healthineers|mindray|sonosite|fujifilm|canon\s+medical|samsung\s+medison|philips)\b/i;

const USASPENDING_NOISE_RX = /\b(stair\s*lift|elevator|wheelchair|prosthetic|scooter|mattress)\b/i;

class SamAuthError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(`SAM.gov ${status}: ${detail}`);
    this.name = "SamAuthError";
    this.status = status;
  }
}

const samAddressSchema = z
  .object({
    name: z.string().nullish(),
    streetAddress: z.string().nullish(),
    streetAddress2: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    zip: z.string().nullish(),
    countryCode: z.string().nullish(),
  })
  .passthrough();

const samPointOfContactSchema = z
  .object({
    type: z.string().nullish(),
    fullName: z.string().nullish(),
    firstName: z.string().nullish(),
    middleName: z.string().nullish(),
    lastName: z.string().nullish(),
    title: z.string().nullish(),
    email: z.string().nullish(),
    phone: z.string().nullish(),
    fax: z.string().nullish(),
  })
  .passthrough();

const samOpportunitySchema = z
  .object({
    noticeId: z.string(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    postedDate: z.string().nullish(),
    type: z.string().nullish(),
    department: z.string().nullish(),
    subTier: z.string().nullish(),
    uiLink: z.string().nullish(),
    responseDeadLine: z.string().nullish(),
    placeOfPerformance: z
      .object({
        city: z.object({ name: z.string().nullish() }).nullish(),
        state: z.object({ name: z.string().nullish(), code: z.string().nullish() }).nullish(),
      })
      .nullish(),
    award: z.object({ amount: z.union([z.string(), z.number()]).nullish() }).nullish(),
    pointOfContact: z.array(samPointOfContactSchema).nullish(),
    officeAddress: samAddressSchema.nullish(),
  })
  .passthrough();

const samResponseSchema = z.object({
  opportunitiesData: z.array(samOpportunitySchema).nullish(),
});

const usaSpendingAwardSchema = z
  .object({
    "Award ID": z.string().nullish(),
    "Recipient Name": z.string().nullish(),
    "Start Date": z.string().nullish(),
    "End Date": z.string().nullish(),
    "Award Amount": z.number().nullish(),
    "Awarding Agency": z.string().nullish(),
    "Awarding Sub Agency": z.string().nullish(),
    "Awarding Office": z.string().nullish(),
    Description: z.string().nullish(),
    "Place of Performance State Code": z.string().nullish(),
    "Place of Performance City Code": z.string().nullish(),
    generated_internal_id: z.string().nullish(),
  })
  .passthrough();

const usaSpendingResponseSchema = z.object({
  results: z.array(usaSpendingAwardSchema).default([]),
});

type SamAddress = z.infer<typeof samAddressSchema>;
type SamOpportunity = z.infer<typeof samOpportunitySchema>;

export async function fetchSamGov(
  opts: {
    apiKey?: string;
    daysBack?: number;
    limit?: number;
  } = {},
): Promise<RawLead[]> {
  const { apiKey, daysBack = 30, limit = 50 } = opts;
  const trimmedKey = apiKey?.trim();

  if (!trimmedKey) {
    logWarn(
      "ingest.sam_gov",
      "SAM_GOV_API_KEY not configured; using keyless USASpending.gov federal contract feed",
    );
    return fetchUsaSpendingFallback({ daysBack: Math.max(daysBack, 180), limit });
  }

  const formatSamDate = (d: Date) => {
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${month}/${day}/${d.getFullYear()}`;
  };
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 86400_000);
  const postedFrom = formatSamDate(from);
  const postedTo = formatSamDate(to);

  let rows: SamOpportunity[];
  try {
    const [batch1, batch2] = await Promise.all([
      fetchByNaics(trimmedKey, "339112", postedFrom, postedTo, limit),
      fetchByNaics(trimmedKey, "334510", postedFrom, postedTo, limit),
    ]);
    const seen = new Set<string>();
    rows = [];
    for (const opportunity of [...batch1, ...batch2]) {
      if (!seen.has(opportunity.noticeId)) {
        seen.add(opportunity.noticeId);
        rows.push(opportunity);
      }
    }
  } catch (err) {
    if (err instanceof SamAuthError) {
      logWarn(
        "ingest.sam_gov",
        "SAM.gov rejected API key; falling back to keyless USASpending.gov federal contract feed",
        { status: err.status, detail: err.message },
      );
      return fetchUsaSpendingFallback({ daysBack: Math.max(daysBack, 180), limit });
    }
    throw err;
  }

  const kwLower = PHILLIPS_KEYWORDS.map((k) => k.toLowerCase());

  return rows
    .filter((o) => {
      const state = o.placeOfPerformance?.state?.name ?? o.placeOfPerformance?.state?.code ?? "";
      return TERRITORY_STATE_NAMES.has(state);
    })
    .filter((o) => {
      const blob = `${o.title ?? ""} ${o.description ?? ""}`.toLowerCase();
      return kwLower.some((k) => blob.includes(k));
    })
    .map((o): RawLead => {
      const contacts = mapPocs(o);
      const pocBlock =
        contacts.length > 0 ? `\nPoint of contact:\n${contacts.map(formatPocLine).join("\n")}` : "";
      const agencyLabel = [o.department, o.subTier].filter(Boolean).join(" — ");
      const stateLabel =
        o.placeOfPerformance?.state?.name ?? o.placeOfPerformance?.state?.code ?? "";
      return {
        source: "sam_gov",
        source_external_id: o.noticeId,
        source_url: o.uiLink ?? `https://sam.gov/opp/${o.noticeId}`,
        title: o.title ?? "Untitled SAM.gov opportunity",
        raw_text: [
          `Hospital/Agency: ${agencyLabel}`,
          `State: ${stateLabel}`,
          `Title: ${o.title ?? ""}`,
          `Type: ${o.type ?? ""}`,
          `Place of Performance: ${o.placeOfPerformance?.city?.name ?? ""}, ${stateLabel}`,
          `Response Deadline: ${o.responseDeadLine ?? "n/a"}`,
          `Award $: ${o.award?.amount ?? "n/a"}`,
          `Description: ${o.description ?? ""}`,
          pocBlock,
        ].join("\n"),
        date_discovered: o.postedDate ?? new Date().toISOString(),
        raw_payload: o as Record<string, unknown>,
        source_contacts: contacts,
      };
    });
}

async function fetchByNaics(
  apiKey: string,
  ncode: string,
  postedFrom: string,
  postedTo: string,
  limit: number,
): Promise<SamOpportunity[]> {
  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom,
    postedTo,
    limit: String(limit),
    ncode,
    ptype: "o,k,p",
  });
  const response = await fetch(`${SAM_BASE}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = sanitizeErrorText(await response.text());
    if (response.status === 401 || response.status === 403) {
      throw new SamAuthError(response.status, detail);
    }
    throw new Error(`SAM.gov ${response.status} (NAICS ${ncode}): ${detail}`);
  }
  const parsed = samResponseSchema.parse(await response.json());
  return parsed.opportunitiesData ?? [];
}

export async function fetchUsaSpendingFallback(opts: {
  daysBack?: number;
  limit?: number;
}): Promise<RawLead[]> {
  const { daysBack = 180, limit = 50 } = opts;
  const startDate = new Date(Date.now() - daysBack * 86400_000).toISOString().slice(0, 10);
  const endDate = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);

  const response = await fetch(USASPENDING_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
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
        "Awarding Office",
        "Description",
        "Place of Performance State Code",
        "Place of Performance City Code",
        "generated_internal_id",
      ],
      filters: {
        award_type_codes: ["A", "B", "C", "D"],
        naics_codes: { require: ["334510", "334517", "339112"] },
        place_of_performance_locations: TERRITORY_STATE_CODES.map((state) => ({
          country: "USA",
          state,
        })),
        time_period: [{ start_date: startDate, end_date: endDate }],
      },
      limit: Math.min(Math.max(limit, 25), 100),
      page: 1,
      sort: "Start Date",
      order: "desc",
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = sanitizeErrorText(await response.text());
    throw new Error(`USASpending.gov ${response.status}: ${detail}`);
  }

  const parsed = usaSpendingResponseSchema.parse(await response.json());
  const nowMs = Date.now();
  const seen = new Set<string>();
  const leads: RawLead[] = [];

  for (const row of parsed.results) {
    const stateCode = (row["Place of Performance State Code"] ?? "").trim().toUpperCase();
    if (!TERRITORY_STATE_NAMES.has(stateCode)) continue;

    const recipient = (row["Recipient Name"] ?? "").trim();
    const description = (row.Description ?? "").trim();
    const agency = (
      row["Awarding Sub Agency"] ??
      row["Awarding Agency"] ??
      "Federal Agency"
    ).trim();
    const office = (row["Awarding Office"] ?? "").trim();
    const searchable = `${recipient} ${description} ${agency} ${office}`;

    if (USASPENDING_NOISE_RX.test(searchable)) continue;
    if (!USASPENDING_MEDICAL_SIGNAL_RX.test(searchable)) continue;

    const internalId = (row.generated_internal_id ?? "").trim();
    const awardId = (row["Award ID"] ?? internalId).trim();
    if (!awardId) continue;

    const externalId = `usaspending:${internalId || awardId}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);

    const stateName = STATE_CODE_TO_NAME[stateCode] ?? stateCode;
    const city = (row["Place of Performance City Code"] ?? "").trim();
    const amount = row["Award Amount"];
    const amountFormatted =
      typeof amount === "number" && Number.isFinite(amount)
        ? `$${Math.round(amount).toLocaleString("en-US")}`
        : "n/a";

    const rawStart = row["Start Date"] ? new Date(`${row["Start Date"]}T00:00:00Z`) : null;
    const discoveredIso =
      rawStart && !Number.isNaN(rawStart.getTime()) && rawStart.getTime() <= nowMs
        ? rawStart.toISOString()
        : new Date(nowMs).toISOString();

    const shortDesc = description ? description.slice(0, 140) : "Medical Equipment Contract";
    const title = `${agency} (${stateCode}) — ${recipient || "Federal Award"}: ${shortDesc}`.slice(
      0,
      280,
    );

    const sourceUrl = internalId
      ? `https://www.usaspending.gov/award/${encodeURIComponent(internalId)}`
      : "https://www.usaspending.gov/search";

    leads.push({
      source: "sam_gov",
      source_external_id: externalId,
      source_url: sourceUrl,
      title,
      raw_text: [
        `Hospital/Agency: ${[agency, office].filter(Boolean).join(" — ")}`,
        `State: ${stateName} (${stateCode})`,
        `Place of Performance: ${[city, stateName].filter(Boolean).join(", ")}`,
        `Incumbent / Recipient Vendor: ${recipient || "Unknown"}`,
        `Award ID: ${awardId}`,
        `Award $: ${amountFormatted}`,
        `Period: ${row["Start Date"] ?? "n/a"} to ${row["End Date"] ?? "n/a"}`,
        `Description: ${description}`,
      ].join("\n"),
      date_discovered: discoveredIso,
      raw_payload: row as Record<string, unknown>,
    });
  }

  return leads;
}

function formatPocLine(contact: LeadContact): string {
  const titlePart = contact.title ? ` (${contact.title})` : "";
  const emailPart = contact.email ? ` <${contact.email}>` : "";
  const phonePart = contact.phone ? ` ${contact.phone}` : "";
  return `- ${contact.name ?? "Unknown"}${titlePart}${emailPart}${phonePart}`;
}

function formatAddress(a?: SamAddress | null): string | null {
  if (!a) return null;
  const parts = [
    a.streetAddress,
    a.streetAddress2,
    [a.city, a.state, a.zip].filter(Boolean).join(", "),
    a.countryCode,
  ].filter((v) => v && String(v).trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

function mapPocs(o: SamOpportunity): LeadContact[] {
  const list = o.pointOfContact ?? [];
  const orgName = o.officeAddress?.name ?? o.subTier ?? o.department ?? null;
  const officeAddr = formatAddress(o.officeAddress);
  return list
    .map((p): LeadContact => {
      const name =
        p.fullName ||
        [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ").trim() ||
        null;
      return {
        name: name && name.length > 0 ? name : null,
        title: p.title ?? null,
        organization: orgName,
        email: p.email ?? null,
        phone: p.phone ?? null,
        address: officeAddr,
        type: p.type ?? null,
        source_origin: "sam_gov",
      };
    })
    .filter((c) => c.name || c.email || c.phone);
}
