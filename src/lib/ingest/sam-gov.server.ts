import type { RawLead } from "./types";
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

  // SAM.gov requires MM/dd/yyyy
  const fmt = (d: Date) => {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}/${day}/${d.getFullYear()}`;
  };
  const to = new Date();
  const from = new Date(Date.now() - daysBack * 86400_000);

  // NAICS 339112 = Surgical/Medical Instrument Mfg, 621 = Health Care
  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom: fmt(from),
    postedTo: fmt(to),
    limit: String(limit),
    ncode: "339112",
    ptype: "o,k,p", // solicitation, combined synopsis, presolicitation
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
    .map((o): RawLead => ({
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
      ].join("\n"),
      date_discovered: o.postedDate ?? new Date().toISOString(),
      raw_payload: o as unknown as Record<string, unknown>,
    }));
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
}
