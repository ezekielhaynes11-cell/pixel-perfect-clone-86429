// Lead types + small helpers shared between dashboard components.
// Real lead rows now come from Lovable Cloud (see useLeads); this file no
// longer ships mock data.

import { cleanLeadTitle, cleanHospital } from "@/lib/lead-clean";

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

export interface LeadEntities {
  hospitals: string[];
  physicians: string[];
  equipment: string[];
  keywords: string[];
}

export interface LeadContact {
  name: string | null;
  title: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  type?: string | null;
  source_origin?: string | null;
}

export interface Lead {
  id: string;
  title: string;
  summary: string;
  source: LeadSource;
  sourceUrl: string;
  confidence: number;
  dateDiscovered: string;
  hospital: string | null;
  specialty: string | null;
  territory: string | null;
  estimatedValueUsd: number | null;
  winProbability: number | null;
  competitorIncumbent: string | null;
  entities: LeadEntities;
  priority: "high" | "medium" | "low";
  signalType: string | null;
  accountType: string | null;
  vendorMentions: string[];
  accountId: string | null;
  sourceContacts: LeadContact[];
}

// DB row → UI Lead
export interface LeadRow {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  source_url: string | null;
  confidence: number;
  date_discovered: string;
  hospital: string | null;
  specialty: string | null;
  territory: string | null;
  estimated_value_usd: number | null;
  win_probability: number | null;
  competitor_incumbent: string | null;
  entities: unknown;
  priority: string;
  signal_type?: string | null;
  account_type?: string | null;
  vendor_mentions?: string[] | null;
  account_id?: string | null;
  source_contacts?: unknown;
}

export function rowToLead(r: LeadRow): Lead {
  const ents = (r.entities as Partial<LeadEntities>) ?? {};
  const contacts = Array.isArray(r.source_contacts)
    ? (r.source_contacts as LeadContact[])
    : [];
  return {
    id: r.id,
    title: cleanLeadTitle(r.title),
    summary: r.summary ?? "",
    source: (r.source as LeadSource) ?? "news",
    sourceUrl: r.source_url ?? "#",
    confidence: r.confidence,
    dateDiscovered: r.date_discovered,
    hospital: cleanHospital(r.hospital),
    specialty: r.specialty,
    territory: r.territory,
    estimatedValueUsd: r.estimated_value_usd,
    winProbability: r.win_probability,
    competitorIncumbent: r.competitor_incumbent,
    entities: {
      hospitals: ents.hospitals ?? [],
      physicians: ents.physicians ?? [],
      equipment: ents.equipment ?? [],
      keywords: ents.keywords ?? [],
    },
    priority: (["high", "medium", "low"].includes(r.priority) ? r.priority : "medium") as Lead["priority"],
    signalType: r.signal_type ?? null,
    accountType: r.account_type ?? null,
    vendorMentions: r.vendor_mentions ?? [],
    accountId: r.account_id ?? null,
    sourceContacts: contacts,
  };
}

// Map a US state name found in lead.territory or hospital text to a 2-letter code
// for the four states Mike covers.
const STATE_CODES: Record<string, "TX" | "OK" | "AR" | "LA"> = {
  texas: "TX",
  oklahoma: "OK",
  arkansas: "AR",
  louisiana: "LA",
  tx: "TX",
  ok: "OK",
  ar: "AR",
  la: "LA",
};

export function leadStateCode(lead: Lead): "TX" | "OK" | "AR" | "LA" | null {
  const haystack = [lead.territory, lead.hospital]
    .filter((x): x is string => !!x)
    .join(" ")
    .toLowerCase();
  for (const [k, v] of Object.entries(STATE_CODES)) {
    if (new RegExp(`\\b${k}\\b`).test(haystack)) return v;
  }
  return null;
}

// High priority is a deliberately tight subset: high-confidence leads that also
// carry a concrete buying signal (recall/RFP) or material estimated value. This
// keeps the "High Priority" headline meaningful instead of flagging ~all leads.
export function leadIsHighPriority(l: Lead): boolean {
  if (l.confidence < 85) return false;
  if (l.signalType === "recall" || l.signalType === "rfp") return true;
  if ((l.estimatedValueUsd ?? 0) >= 250_000) return true;
  return false;
}

// True when a lead was discovered on the current local calendar day.
export function isDiscoveredToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function leadHospital(l: Lead): string | null {
  if (l.hospital && l.hospital.trim()) return l.hospital.trim();
  const first = l.entities.hospitals?.[0];
  return first && first.trim() ? first.trim() : null;
}

export function opportunityType(l: Lead): string {
  switch (l.signalType) {
    case "recall": return "Regulatory Response";
    case "rfp": return "Equipment Replacement";
    case "funding":
    case "expansion": return "New Facility";
    case "m_and_a":
    case "incumbency": return "Competitive Displacement";
    case "sentiment": return "Market Intelligence";
  }
  if (l.vendorMentions.length > 0 || l.competitorIncumbent) return "Competitive Displacement";
  if (l.entities.equipment.length > 0) return "Clinical Event";
  if (l.entities.keywords.length > 0) return "Market Intelligence";
  return "Other";
}

export const sources: LeadSource[] = [
  "sam_gov",
  "openfda",
  "gdelt",
  "gdelt_m_and_a",
  "gdelt_va_funding",
  "reddit",
  "bluesky",
  "news",
  "clinicaltrials",
  "cms_open_payments",
  "funding_rss",
];

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}
