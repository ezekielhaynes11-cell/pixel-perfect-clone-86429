export type LeadSource =
  | "sam_gov"
  | "openfda"
  | "gdelt"
  | "reddit"
  | "news"
  | "clinicaltrials"
  | "cms_open_payments";

export interface RawLead {
  source: LeadSource;
  source_external_id: string;
  source_url: string;
  title: string;
  raw_text: string; // text passed to enrichment model
  date_discovered: string; // ISO
  raw_payload: Record<string, unknown>;
}

export interface EnrichmentResult {
  summary: string;
  confidence: number; // 0-100
  priority: "high" | "medium" | "low";
  hospital: string | null;
  specialty: string | null;
  territory: string | null;
  estimated_value_usd: number | null;
  win_probability: number | null;
  competitor_incumbent: string | null;
  entities: {
    hospitals: string[];
    physicians: string[];
    equipment: string[];
    keywords: string[];
  };
}

// Equipment / Phillips-relevant keyword set (used by all adapters)
export const PHILLIPS_KEYWORDS = [
  "ultrasound",
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
