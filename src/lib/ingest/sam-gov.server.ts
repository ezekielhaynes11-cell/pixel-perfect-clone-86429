import type { RawLead, LeadContact } from "./types";
import { PHILLIPS_KEYWORDS } from "./types";

// SAM.gov Opportunities API v2
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
const BASE = "https://api.sam.gov/opportunities/v2/search";

const TERRITORY_STATE_NAMES = new Set([
  "Texas",
  "Oklahoma",
  "Arkansas",
  "Louisiana",
  "TX",
  "OK",
  "AR",
  "LA",
]);

export async function fetchSamGov(opts: {
  apiKey: string;
  daysBack?: number;
  limit?: number;
}): Promise<RawLead[]> {
  const { apiKey, daysBack = 30, limit = 50 } = opts;

  const fmt = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}/${day}/${d.getFullYear()}`;
  };
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 86400_000);
  const postedFrom = fmt(from);
  const postedTo = fmt(to);

  // Fetch both NAICS codes and dedup by noticeId
  const [batch1, batch2] = await Promise.all([
    fetchByNaics(apiKey, "339112", postedFrom, postedTo, limit),
    fetchByNaics(apiKey, "334510", postedFrom, postedTo, limit),
  ]);

  const seen = new Set<string>();
  const rows: SamOpportunity[] = [];
  for (const o of [...batch1, ...batch2]) {
    if (!seen.has(o.noticeId)) {
      seen.add(o.noticeId);
      rows.push(o);
    }
  }

  const kwLower = PHILLIPS_KEYWORDS.map((k) => k.toLowerCase());

  return rows
    .filter((o) => {
      // Territory filter — keep only TX/OK/AR/LA placements
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
        contacts.length > 0
          ? "\nPoint of contact:\n" +
            contacts
              .map(
                (c) =>
                  `- ${c.name ?? "Unknown"}${c.title ? ` (${c.title})` : ""}${
                    c.email ? ` <${c.email}>` : ""
                  }${c.phone ? ` ${c.phone}` : ""}`,
              )
              .join("\n")
          : "";
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
        raw_payload: o as unknown as Record<string, unknown>,
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
  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) {
    throw new Error(`SAM.gov ${res.status} (NAICS ${ncode}): ${await res.text()}`);
  }
  const json = (await res.json()) as { opportunitiesData?: SamOpportunity[] };
  return json.opportunitiesData ?? [];
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

interface SamAddress {
  name?: string;
  streetAddress?: string;
  streetAddress2?: string;
  city?: string;
  state?: string;
  zip?: string;
  countryCode?: string;
}

interface SamPointOfContact {
  type?: string;
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  title?: string;
  email?: string;
  phone?: string;
  fax?: string;
}

interface SamOpportunity {
  noticeId: string;
  title?: string;
  description?: string;
  postedDate?: string;
  type?: string;
  department?: string;
  subTier?: string;
  uiLink?: string;
  responseDeadLine?: string;
  placeOfPerformance?: {
    city?: { name?: string };
    state?: { name?: string; code?: string };
  };
  award?: { amount?: string };
  pointOfContact?: SamPointOfContact[];
  officeAddress?: SamAddress;
}
