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
  // The feed is sorted by confidence (best first) rather than filtered by it, and
  // there is no min-confidence UI control, so the default is 0 — never silently
  // hide sub-threshold leads with no way to reveal them. (minConfidence stays in
  // the type because saved-search alerting can still set it.)
  minConfidence: 0,
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
