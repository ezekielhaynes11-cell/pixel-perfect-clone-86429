// Lead types + small helpers shared between dashboard components.
// Real lead rows come from Supabase; this module contains zero mock data.

import { cleanLeadTitle, cleanHospital } from "@/lib/lead-clean";
import { territoryToCode } from "@/lib/territory";

export const ACTIVE_LEAD_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type LeadSource =
  | "rural_rht"
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

export const SOURCE_LABELS: Record<LeadSource, string> = {
  rural_rht: "CMS Rural RHT",
  sam_gov: "SAM.gov & Federal",
  openfda: "FDA Recalls",
  clinicaltrials: "ClinicalTrials.gov",
  cms_open_payments: "CMS Open Payments",
  funding_rss: "Gov Funding RSS",
  gdelt: "Hospital News",
  gdelt_m_and_a: "Vendor M&A News",
  gdelt_va_funding: "VA Funding News",
  news: "Press & Industry",
  reddit: "Clinician Reddit",
  bluesky: "Clinician Bluesky",
};

export type LeadType =
  | "rural_rht"
  | "rfp_procurement"
  | "grant_funding"
  | "fda_recall"
  | "expansion_trial"
  | "competitive_ma"
  | "clinician_sentiment";

export const LEAD_TYPE_OPTIONS: readonly LeadType[] = [
  "rural_rht",
  "rfp_procurement",
  "grant_funding",
  "fda_recall",
  "expansion_trial",
  "competitive_ma",
  "clinician_sentiment",
];

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  rural_rht: "Rural Health RHT ($50B)",
  rfp_procurement: "Active RFP / Procurement",
  grant_funding: "Grant & Capital Award",
  fda_recall: "FDA Competitor Recall",
  expansion_trial: "Hospital Expansion & Trials",
  competitive_ma: "Vendor M&A & Incumbency",
  clinician_sentiment: "Clinician Sentiment",
};

export type DatePreset = "all" | "today" | "3d" | "7d" | "14d" | "30d" | "custom";

export const DATE_PRESET_OPTIONS: readonly DatePreset[] = [
  "all",
  "today",
  "3d",
  "7d",
  "14d",
  "30d",
  "custom",
];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  all: "All Active (30d)",
  today: "Today",
  "3d": "Last 3 Days",
  "7d": "Last 7 Days",
  "14d": "Last 14 Days",
  "30d": "Last 30 Days",
  custom: "Custom Range",
};

export type SortOption = "priority" | "newest" | "value";

export const SORT_OPTION_OPTIONS: readonly SortOption[] = ["priority", "newest", "value"];

export const SORT_OPTION_LABELS: Record<SortOption, string> = {
  priority: "Priority & Confidence",
  newest: "Newest First",
  value: "Highest Est. Value",
};

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
  dateIngested?: string | null;
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

export interface LeadRow {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  source_url: string | null;
  confidence: number;
  date_discovered: string;
  date_ingested?: string | null;
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

export function normalizePhysicianStrings(rawPhysicians: unknown): string[] {
  if (!Array.isArray(rawPhysicians)) return [];
  const normalized: string[] = [];
  for (const entry of rawPhysicians) {
    if (typeof entry === "string" && entry.trim()) {
      normalized.push(entry.trim());
      continue;
    }
    if (entry && typeof entry === "object" && "name" in entry) {
      const candidate = entry as { name?: unknown; role_hint?: unknown };
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      if (!name) continue;
      const roleHint = typeof candidate.role_hint === "string" ? candidate.role_hint.trim() : "";
      normalized.push(roleHint ? `${name} (${roleHint})` : name);
    }
  }
  return normalized;
}

export function rowToLead(row: LeadRow): Lead {
  const rawEntities =
    row.entities && typeof row.entities === "object"
      ? (row.entities as Record<string, unknown>)
      : {};
  const contacts = Array.isArray(row.source_contacts) ? (row.source_contacts as LeadContact[]) : [];
  return {
    id: row.id,
    title: cleanLeadTitle(row.title),
    summary: row.summary ?? "",
    source: (row.source as LeadSource) ?? "news",
    sourceUrl: row.source_url ?? "#",
    confidence: row.confidence,
    dateDiscovered: row.date_discovered,
    dateIngested: row.date_ingested ?? null,
    hospital: cleanHospital(row.hospital),
    specialty: row.specialty,
    territory: row.territory,
    estimatedValueUsd: row.estimated_value_usd,
    winProbability: row.win_probability,
    competitorIncumbent: row.competitor_incumbent,
    entities: {
      hospitals: Array.isArray(rawEntities.hospitals) ? (rawEntities.hospitals as string[]) : [],
      physicians: normalizePhysicianStrings(rawEntities.physicians),
      equipment: Array.isArray(rawEntities.equipment) ? (rawEntities.equipment as string[]) : [],
      keywords: Array.isArray(rawEntities.keywords) ? (rawEntities.keywords as string[]) : [],
    },
    priority: (["high", "medium", "low"].includes(row.priority)
      ? row.priority
      : "medium") as Lead["priority"],
    signalType: row.signal_type ?? null,
    accountType: row.account_type ?? null,
    vendorMentions: row.vendor_mentions ?? [],
    accountId: row.account_id ?? null,
    sourceContacts: contacts,
  };
}

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
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLowerCase();
  for (const [key, stateCode] of Object.entries(STATE_CODES)) {
    if (new RegExp(`\\b${key}\\b`).test(haystack)) return stateCode;
  }
  return null;
}

export function leadInTerritoryScope(lead: Lead, territoryStates: ReadonlySet<string>): boolean {
  const matchedTerritory = leadStateCode(lead);
  if (matchedTerritory && territoryStates.has(matchedTerritory)) {
    return true;
  }
  // Nationwide competitor recalls and multi-state rural grant notices apply to TX/OK/AR/LA accounts.
  if (lead.signalType === "recall" || lead.source === "rural_rht") {
    const explicitState = territoryToCode(lead.territory);
    return explicitState === null || territoryStates.has(explicitState);
  }
  return false;
}

export function leadFreshnessTimestamp(lead: Lead): number {
  const ingestedTs = lead.dateIngested ? new Date(lead.dateIngested).getTime() : Number.NaN;
  if (!Number.isNaN(ingestedTs)) return ingestedTs;
  const discoveredTs = new Date(lead.dateDiscovered).getTime();
  return Number.isNaN(discoveredTs) ? 0 : discoveredTs;
}

export function isArchivedLead(lead: Lead, nowMs = Date.now()): boolean {
  const ts = leadFreshnessTimestamp(lead);
  if (ts <= 0) return true;
  return nowMs - ts > ACTIVE_LEAD_WINDOW_MS;
}

const RURAL_SIGNAL_RX =
  /\b(rural\s+health|critical\s+access\s+hospital|rural\s+hospital|rural\s+emergency\s+hospital|rural\s+medical|\brhtp?\b)\b/i;

export function isRuralCampaignLead(lead: Lead): boolean {
  if (lead.source === "rural_rht") return true;
  return RURAL_SIGNAL_RX.test(`${lead.title} ${lead.summary} ${lead.hospital ?? ""}`);
}

export function classifyLeadType(lead: Lead): LeadType {
  if (isRuralCampaignLead(lead)) return "rural_rht";
  if (lead.signalType === "recall" || lead.source === "openfda") return "fda_recall";
  if (lead.signalType === "rfp") return "rfp_procurement";
  if (
    lead.signalType === "funding" ||
    lead.source === "funding_rss" ||
    lead.source === "gdelt_va_funding"
  ) {
    return "grant_funding";
  }
  if (
    lead.signalType === "m_and_a" ||
    lead.signalType === "incumbency" ||
    lead.source === "gdelt_m_and_a" ||
    lead.source === "cms_open_payments"
  ) {
    return "competitive_ma";
  }
  if (lead.signalType === "sentiment" || lead.source === "reddit" || lead.source === "bluesky") {
    return "clinician_sentiment";
  }
  return "expansion_trial";
}

const ACTIONABLE_HIGH_PRIORITY_SIGNALS = new Set<string>(["recall", "rfp", "funding", "expansion"]);

export function leadIsHighPriority(lead: Lead): boolean {
  const materialValue = (lead.estimatedValueUsd ?? 0) >= 250_000;
  const actionableSignal =
    lead.signalType != null && ACTIONABLE_HIGH_PRIORITY_SIGNALS.has(lead.signalType);

  if (lead.confidence >= 85) {
    return actionableSignal || materialValue;
  }
  if (lead.priority === "high" && lead.confidence >= 65) {
    return true;
  }
  if (lead.confidence >= 65 && actionableSignal && materialValue) {
    return true;
  }
  return false;
}

export function compareLeadsByPriorityAndRecency(a: Lead, b: Lead): number {
  const prioDiff = Number(leadIsHighPriority(b)) - Number(leadIsHighPriority(a));
  if (prioDiff !== 0) return prioDiff;
  if (b.confidence !== a.confidence) return b.confidence - a.confidence;
  return leadFreshnessTimestamp(b) - leadFreshnessTimestamp(a);
}

export function sortLeads(leads: readonly Lead[], sortBy: SortOption): Lead[] {
  const copy = [...leads];
  if (sortBy === "newest") {
    return copy.sort((a, b) => {
      const diff = leadFreshnessTimestamp(b) - leadFreshnessTimestamp(a);
      return diff !== 0 ? diff : b.confidence - a.confidence;
    });
  }
  if (sortBy === "value") {
    return copy.sort((a, b) => {
      const valDiff = (b.estimatedValueUsd ?? 0) - (a.estimatedValueUsd ?? 0);
      return valDiff !== 0 ? valDiff : compareLeadsByPriorityAndRecency(a, b);
    });
  }
  return copy.sort(compareLeadsByPriorityAndRecency);
}

export function isSameLocalCalendarDay(iso: string | null | undefined, now: Date): boolean {
  if (!iso) return false;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  );
}

export function isDiscoveredToday(
  dateDiscovered: string,
  dateIngested?: string | null,
  nowMs = Date.now(),
): boolean {
  const now = new Date(nowMs);
  return isSameLocalCalendarDay(dateDiscovered, now) || isSameLocalCalendarDay(dateIngested, now);
}

function parseLocalDateBound(ymd: string, endOfDay: boolean): number | null {
  const match = ymd.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const bound = endOfDay
    ? new Date(year, month, day, 23, 59, 59, 999)
    : new Date(year, month, day, 0, 0, 0, 0);
  const ts = bound.getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function leadMatchesDateFilter(
  lead: Lead,
  opts: {
    onlyToday: boolean;
    datePreset: DatePreset;
    dateFrom: string;
    dateTo: string;
  },
  nowMs = Date.now(),
): boolean {
  if (opts.onlyToday || opts.datePreset === "today") {
    return isDiscoveredToday(lead.dateDiscovered, lead.dateIngested, nowMs);
  }

  const freshnessTs = leadFreshnessTimestamp(lead);
  if (
    opts.datePreset === "3d" ||
    opts.datePreset === "7d" ||
    opts.datePreset === "14d" ||
    opts.datePreset === "30d"
  ) {
    const days = Number.parseInt(opts.datePreset, 10);
    return freshnessTs >= nowMs - days * 86_400_000;
  }

  const fromMs = opts.dateFrom ? parseLocalDateBound(opts.dateFrom, false) : null;
  const toMs = opts.dateTo ? parseLocalDateBound(opts.dateTo, true) : null;
  if (fromMs !== null && freshnessTs < fromMs) return false;
  if (toMs !== null && freshnessTs > toMs) return false;
  return true;
}

export function leadHospital(lead: Lead): string | null {
  if (lead.hospital && lead.hospital.trim()) return lead.hospital.trim();
  const first = lead.entities.hospitals?.[0];
  return first && first.trim() ? first.trim() : null;
}

export function opportunityType(lead: Lead): string {
  if (isRuralCampaignLead(lead)) return "CMS $50B Rural RHT";
  switch (lead.signalType) {
    case "recall":
      return "Regulatory Response";
    case "rfp":
      return "Equipment Replacement";
    case "funding":
    case "expansion":
      return "New Facility";
    case "m_and_a":
    case "incumbency":
      return "Competitive Displacement";
    case "sentiment":
      return "Market Intelligence";
  }
  if (lead.vendorMentions.length > 0 || lead.competitorIncumbent) return "Competitive Displacement";
  if (lead.entities.equipment.length > 0) return "Clinical Event";
  if (lead.entities.keywords.length > 0) return "Market Intelligence";
  return "Other";
}

export const sources: LeadSource[] = [
  "rural_rht",
  "sam_gov",
  "openfda",
  "clinicaltrials",
  "cms_open_payments",
  "funding_rss",
  "gdelt",
  "gdelt_m_and_a",
  "gdelt_va_funding",
  "news",
  "reddit",
  "bluesky",
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

export function formatUsd(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${Math.round(amount)}`;
}
