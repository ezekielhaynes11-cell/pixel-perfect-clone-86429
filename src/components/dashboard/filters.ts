// Filter types + constants shared by FilterBar, the dashboard route, and the
// saved-searches drawer. Kept in a separate module (not FilterBar.tsx) so the
// component file only exports components — otherwise React Fast Refresh warns
// and full-reloads on every edit.

import type { DatePreset, LeadSource, LeadType, SortOption } from "@/data/leads";

export type SignalType =
  "recall" | "rfp" | "funding" | "m_and_a" | "expansion" | "sentiment" | "incumbency";

export type AccountType = "va" | "non_va";

export type TerritoryState = "TX" | "OK" | "AR" | "LA";

export interface Filters {
  hospitals: string[];
  specialties: string[];
  sources: LeadSource[];
  leadTypes: LeadType[];
  signalTypes: SignalType[];
  accountTypes: AccountType[];
  vendors: string[];
  states: TerritoryState[];
  minConfidence: number;
  onlyToday: boolean;
  onlyHighPriority: boolean;
  onlyRural: boolean;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  sortBy: SortOption;
}

export const emptyFilters: Filters = {
  hospitals: [],
  specialties: [],
  sources: [],
  leadTypes: [],
  signalTypes: [],
  accountTypes: [],
  vendors: [],
  states: [],
  minConfidence: 0,
  onlyToday: false,
  onlyHighPriority: false,
  onlyRural: false,
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  sortBy: "priority",
};

export const signalTypeOptions: SignalType[] = [
  "recall",
  "rfp",
  "funding",
  "m_and_a",
  "expansion",
  "sentiment",
  "incumbency",
];
