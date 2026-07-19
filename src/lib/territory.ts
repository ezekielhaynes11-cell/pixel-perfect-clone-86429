// Canonical US-state mapping shared across the app.
//
// Three representations exist in the codebase and used to be mapped ad-hoc in
// ~5 places (data/leads.ts, run.server.ts, copilot-tools.server.ts, apollo
// service): 2-letter CODE ("TX"), lowercase SLUG ("texas", how enrichment stores
// leads.territory), and display NAME ("Texas"). Divergence between them caused
// saved-search state alerts to silently never fire ("tx" !== "texas").

export const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_NAME_TO_CODE).map(([name, code]) => [
    code,
    name.replace(/\b\w/g, (c) => c.toUpperCase()),
  ]),
);

// Normalize any territory representation (code, slug/name, mixed case) to a
// 2-letter uppercase code, or null if it isn't a recognizable US state.
export function territoryToCode(territory: string | null | undefined): string | null {
  if (!territory) return null;
  const t = territory.trim().toLowerCase();
  if (t.length === 2 && Object.values(STATE_NAME_TO_CODE).includes(t.toUpperCase())) {
    return t.toUpperCase();
  }
  return STATE_NAME_TO_CODE[t] ?? null;
}

// True when a lead's territory matches any of the saved 2-letter state codes.
// Compares on normalized codes so "TX" matches a lead stored as "texas".
export function territoryMatchesStates(
  savedStateCodes: string[],
  leadTerritory: string | null | undefined,
): boolean {
  const code = territoryToCode(leadTerritory);
  if (!code) return false;
  return savedStateCodes.some((s) => s.toUpperCase() === code);
}
