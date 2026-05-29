import type { RawLead } from "./types";

// CMS Open Payments — Socrata-style API at openpaymentsdata.cms.gov
// Docs: https://www.cms.gov/openpayments/data
// We pull recent high-value payments from Philips' main competitors to US physicians.
// Each row becomes a buying-signal lead: "Dr. X at Hospital Y just took $40k from GE — that's
// the incumbent. Time to flip them or shore up Philips champions nearby."

const COMPETITORS = [
  "Siemens Healthineers",
  "Siemens Medical Solutions",
  "GE Healthcare",
  "GE HealthCare Technologies",
  "Canon Medical Systems",
  "Hologic",
  "Mindray",
];

// Latest year of general payments — CMS publishes datasets named OP_DTL_GNRL_PGYR{YEAR}_*
// We use the 2023 dataset (most recent fully published). When CMS rolls 2024, bump this constant.
const DATASET_YEAR = 2023;
const BASE = `https://openpaymentsdata.cms.gov/api/1/datastore/query`;

interface OpRow {
  Physician_First_Name?: string;
  Physician_Last_Name?: string;
  Physician_Primary_Type?: string;
  Physician_Specialty?: string;
  Recipient_City?: string;
  Recipient_State?: string;
  Recipient_Primary_Business_Street_Address_Line1?: string;
  Submitting_Applicable_Manufacturer_or_Applicable_GPO_Name?: string;
  Total_Amount_of_Payment_USDollars?: string;
  Date_of_Payment?: string;
  Nature_of_Payment_or_Transfer_of_Value?: string;
  Name_of_Drug_or_Biological_or_Device_or_Medical_Supply_1?: string;
  Record_ID?: string;
}

export async function fetchCmsOpenPayments(opts: { limit?: number; minAmount?: number; territoryState?: string } = {}): Promise<RawLead[]> {
  const { limit = 40, minAmount = 5000, territoryState = "CA" } = opts;

  // CMS exposes each dataset under a slug identifier resolved by the discovery API.
  const datasetId = `general-payments-${DATASET_YEAR}`;

  const url = `${BASE}/${datasetId}/0`;
  const qs = new URLSearchParams({
    limit: String(limit),
    "conditions[0][property]": "Recipient_State",
    "conditions[0][value]": territoryState,
    "conditions[0][operator]": "=",
    "sort[0][property]": "Date_of_Payment",
    "sort[0][order]": "desc",
  });

  const res = await fetch(`${url}?${qs}`, { headers: { Accept: "application/json" } });

  // If the discovery API is unavailable (CMS rotates dataset IDs occasionally),
  // log and return empty rather than failing the whole ingestion run.
  if (!res.ok) {
    if (res.status === 404 || res.status === 400) {
      console.warn(`CMS Open Payments unavailable (${res.status}); skipping this run`);
      return [];
    }
    throw new Error(`CMS Open Payments ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const json = (await res.json().catch(() => ({}))) as { results?: OpRow[] };
  const rows = (json.results ?? []).filter((r) => {
    const mfr = (r.Submitting_Applicable_Manufacturer_or_Applicable_GPO_Name ?? "").toLowerCase();
    const amt = Number(r.Total_Amount_of_Payment_USDollars ?? 0);
    return amt >= minAmount && COMPETITORS.some((c) => mfr.includes(c.split(" ")[0].toLowerCase()));
  });

  // Group by physician + manufacturer to deduplicate noise (one signal per relationship)
  const grouped = new Map<string, { rows: OpRow[]; total: number }>();
  for (const r of rows) {
    const key = `${r.Physician_First_Name}|${r.Physician_Last_Name}|${r.Submitting_Applicable_Manufacturer_or_Applicable_GPO_Name}`;
    const amt = Number(r.Total_Amount_of_Payment_USDollars ?? 0);
    const g = grouped.get(key) ?? { rows: [], total: 0 };
    g.rows.push(r);
    g.total += amt;
    grouped.set(key, g);
  }


  return Array.from(grouped.entries())
    .filter(([, g]) => g.total >= minAmount)
    .map(([key, g]): RawLead => {
      const first = g.rows[0];
      const name = `Dr. ${first.Physician_First_Name ?? ""} ${first.Physician_Last_Name ?? ""}`.trim();
      const mfr = first.Submitting_Applicable_Manufacturer_or_Applicable_GPO_Name ?? "Unknown competitor";
      const city = first.Recipient_City ?? "";
      const state = first.Recipient_State ?? "";
      const specialty = first.Physician_Specialty ?? "";
      const lastDate = g.rows
        .map((r) => r.Date_of_Payment ?? "")
        .filter(Boolean)
        .sort()
        .pop();

      return {
        source: "cms_open_payments",
        source_external_id: `op-${DATASET_YEAR}-${key.replace(/[^a-z0-9]/gi, "-")}`,
        source_url: "https://openpaymentsdata.cms.gov/",
        title: `Competitor relationship: ${name} ↔ ${mfr}`,
        raw_text: [
          `Physician: ${name}`,
          `Specialty: ${specialty}`,
          `Location: ${city}, ${state}`,
          `Competitor: ${mfr}`,
          `Total payments (${DATASET_YEAR}): $${g.total.toLocaleString()}`,
          `Payment count: ${g.rows.length}`,
          `Last payment date: ${lastDate ?? "n/a"}`,
          `Most-recent transfer nature: ${g.rows[0].Nature_of_Payment_or_Transfer_of_Value ?? ""}`,
          `Device/program: ${g.rows[0].Name_of_Drug_or_Biological_or_Device_or_Medical_Supply_1 ?? ""}`,
          `Signal: Incumbent vendor relationship — assess whether this physician is a Philips switcher candidate, or whether to neutralize their influence on the buying committee.`,
        ].join("\n"),
        date_discovered: lastDate ? new Date(lastDate).toISOString() : new Date().toISOString(),
        raw_payload: { rows: g.rows, total: g.total } as unknown as Record<string, unknown>,
      };
    });
}
