// Filter types + constants shared by FilterBar, the dashboard route, and the
// saved-searches drawer. Kept in a separate module (not FilterBar.tsx) so the
// component file only exports components — otherwise React Fast Refresh warns
// and full-reloads on every edit.

import type { LeadSource } from "@/data/leads";

export type SignalType =
  | "recall"
  | "rfp"
  | "funding"
  | "m_and_a"
  | "expansion"
  | "sentiment"
  | "incumbency";

export type AccountType = "va" | "non_va";

export type TerritoryState = "TX" | "OK" | "AR" | "LA";

export interface Filters {
  hospitals: string[];
  specialties: string[];
  sources: LeadSource[];
  signalTypes: SignalType[];
  accountTypes: AccountType[];
  vendors: string[];
  states: TerritoryState[];
  minConfidence: number;
}

export const emptyFilters: Filters = {
  hospitals: [],
  specialties: [],
  sources: [],
  signalTypes: [],
  accountTypes: [],
  vendors: [],
  states: [],
  minConfidence: 75,
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
