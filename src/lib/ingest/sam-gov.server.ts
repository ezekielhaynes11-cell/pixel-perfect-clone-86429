import type { RawLead, LeadContact } from "./types";
import { PHILLIPS_KEYWORDS } from "./types";

// SAM.gov Opportunities API v2
// Docs: https://open.gsa.gov/api/get-opportunities-public-api/
const BASE = "https://api.sam.gov/opportunities/v2/search";

export async function fetchSamGov(opts: {
  apiKey: string;
  daysBack?: number;
  limit?: number;
}): Promise<RawLead[]> {
  const { apiKey, daysBack = 14, limit = 50 } = opts;

  const fmt = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}/${day}/${d.getFullYear()}`;
  };
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 86400_000);

  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: fmt(from),
    postedTo: fmt(to),
    limit: String(limit),
    ncode: "339112",
    ptype: "o,k,p",
  });

  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) {
    throw new Error(`SAM.gov ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { opportunitiesData?: SamOpportunity[] };
  const rows = json.opportunitiesData ?? [];

  const kwLower = PHILLIPS_KEYWORDS.map((k) => k.toLowerCase());

  return rows
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
      return {
        source: "sam_gov",
        source_external_id: o.noticeId,
        source_url: o.uiLink ?? `https://sam.gov/opp/${o.noticeId}`,
        title: o.title ?? "Untitled SAM.gov opportunity",
        raw_text: [
          `Title: ${o.title ?? ""}`,
          `Type: ${o.type ?? ""}`,
          `Department: ${o.department ?? ""}`,
          `Office: ${o.subTier ?? ""}`,
          `Place of Performance: ${o.placeOfPerformance?.city?.name ?? ""}, ${o.placeOfPerformance?.state?.name ?? ""}`,
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
  const orgName =
    o.officeAddress?.name ?? o.subTier ?? o.department ?? null;
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
    state?: { name?: string };
  };
  award?: { amount?: string };
  pointOfContact?: SamPointOfContact[];
  officeAddress?: SamAddress;
}
