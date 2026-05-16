export type LeadSource =
  | "sam_gov"
  | "openfda"
  | "gdelt"
  | "gdelt_m_and_a"
  | "gdelt_va_funding"
  | "reddit"
  | "bluesky"
  | "news"
  | "clinicaltrials"
  | "cms_open_payments"
  | "funding_rss";

export interface RawLead {
  source: LeadSource;
  source_external_id: string;
  source_url: string;
  title: string;
  raw_text: string;
  date_discovered: string;
  raw_payload: Record<string, unknown>;
}

export type SignalType =
  | "recall"
  | "rfp"
  | "funding"
  | "expansion"
  | "sentiment"
  | "m_and_a"
  | "incumbency"
  | "other";

export type AccountType = "va" | "non_va" | "unknown";

export interface EnrichmentResult {
  summary: string;
  confidence: number;
  priority: "high" | "medium" | "low";
  hospital: string | null;
  specialty: string | null;
  territory: string | null;
  estimated_value_usd: number | null;
  win_probability: number | null;
  competitor_incumbent: string | null;
  account_type: AccountType;
  signal_type: SignalType;
  vendor_mentions: string[];
  entities: {
    hospitals: string[];
    physicians: Array<{ name: string; role_hint?: string | null }>;
    equipment: string[];
    keywords: string[];
  };
}

// Fallback keyword list when the keyword_lists DB table is empty.
export const PHILLIPS_KEYWORDS = [
  "ultrasound",
  "POCUS",
  "point-of-care ultrasound",
  "MRI",
  "CT scanner",
  "ventilator",
  "ECMO",
  "infusion pump",
  "patient monitor",
  "cath lab",
  "catheterization",
  "cardiac imaging",
  "echocardiography",
  "defibrillator",
  "imaging system",
  "anesthesia",
];
