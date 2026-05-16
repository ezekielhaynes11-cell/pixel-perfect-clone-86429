import type { RawLead } from "./types";

// openFDA Device Enforcement (recall) API
const BASE = "https://api.fda.gov/device/enforcement.json";

export async function fetchOpenFda(opts: { daysBack?: number; limit?: number } = {}): Promise<RawLead[]> {
  const { daysBack = 60, limit = 50 } = opts;
  const since = new Date(Date.now() - daysBack * 86400_000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");
  const to = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const search = `recall_initiation_date:[${since}+TO+${to}]+AND+(classification:"Class+I"+OR+classification:"Class+II")`;
  const url = `${BASE}?search=${search}&limit=${limit}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) return [];
    throw new Error(`openFDA ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { results?: FdaRecall[] };
  const rows = json.results ?? [];

  return rows
    .filter((r) => {
      const firm = (r.recalling_firm ?? "").toLowerCase();
      return !firm.includes("philips") && !firm.includes("phillips");
    })
    .map((r): RawLead => ({
      source: "openfda",
      source_external_id: r.recall_number ?? `${r.event_id}-${r.product_code ?? ""}`,
      source_url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfres/res.cfm?id=${r.cfres_id ?? ""}`,
      title: `${r.classification ?? "FDA Recall"} — ${r.recalling_firm ?? "Competitor"}: ${truncate(r.product_description ?? "device", 90)}`,
      raw_text: [
        `Recalling firm: ${r.recalling_firm}`,
        `Classification: ${r.classification}`,
        `Product: ${r.product_description}`,
        `Reason: ${r.reason_for_recall}`,
        `Status: ${r.status}`,
        `Code info: ${r.code_info}`,
        `Affected distribution: ${r.distribution_pattern}`,
        `Quantity in commerce: ${r.product_quantity}`,
        `Recall initiation date: ${r.recall_initiation_date}`,
      ].join("\n"),
      date_discovered: parseFdaDate(r.recall_initiation_date) ?? new Date().toISOString(),
      raw_payload: r as unknown as Record<string, unknown>,
    }));
}

function parseFdaDate(s?: string): string | null {
  if (!s || s.length !== 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`;
}
function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

interface FdaRecall {
  recall_number?: string;
  event_id?: string;
  product_code?: string;
  cfres_id?: string;
  recalling_firm?: string;
  classification?: string;
  product_description?: string;
  reason_for_recall?: string;
  status?: string;
  code_info?: string;
  distribution_pattern?: string;
  product_quantity?: string;
  recall_initiation_date?: string;
}
