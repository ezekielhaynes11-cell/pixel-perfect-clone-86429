// Lead types + small helpers shared between dashboard components.
// Real lead rows now come from Lovable Cloud (see useLeads); this file no
// longer ships mock data.

export type LeadSource = "sam_gov" | "openfda" | "gdelt" | "reddit" | "news";

export interface LeadEntities {
  hospitals: string[];
  physicians: string[];
  equipment: string[];
  keywords: string[];
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
}

export function rowToLead(r: LeadRow): Lead {
  const ents = (r.entities as Partial<LeadEntities>) ?? {};
  return {
    id: r.id,
    title: r.title,
    summary: r.summary ?? "",
    source: (r.source as LeadSource) ?? "news",
    sourceUrl: r.source_url ?? "#",
    confidence: r.confidence,
    dateDiscovered: r.date_discovered,
    hospital: r.hospital,
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
  };
}

export const sources: LeadSource[] = ["sam_gov", "openfda", "gdelt", "reddit", "news"];

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
