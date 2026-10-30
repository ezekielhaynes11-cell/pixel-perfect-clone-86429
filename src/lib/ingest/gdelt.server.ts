import { z } from "zod";
import { logWarn } from "../logger.server";
import type { RawLead, LeadSource } from "./types";

const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";
const REQUEST_TIMEOUT_MS = 12_000;

const QUERIES: Array<{ source: LeadSource; query: string }> = [
  {
    source: "gdelt",
    query: [
      '("hospital" OR "health system" OR "medical center")',
      '("capital budget" OR "expansion" OR "fellowship" OR "new wing" OR "ribbon cutting" OR "groundbreaking" OR "imaging center")',
      "sourcecountry:US",
    ].join(" "),
  },
  {
    source: "gdelt_m_and_a",
    query: [
      '("acquisition" OR "acquires" OR "manufacturing" OR "offshoring" OR "end of life" OR "EOL" OR "merger")',
      '("GE Healthcare" OR "Mindray" OR "Samsung" OR "Canon Medical" OR "Siemens Healthineers" OR "SonoSite" OR "Fujifilm")',
    ].join(" "),
  },
  {
    source: "gdelt_va_funding",
    query: [
      '("rural hospital" OR "Veterans Affairs" OR "VA hospital" OR "HRSA grant" OR "capital campaign" OR "modernization")',
      '("Texas" OR "Oklahoma" OR "Arkansas" OR "Louisiana")',
      "sourcecountry:US",
    ].join(" "),
  },
];

const gdeltArticleSchema = z
  .object({
    url: z.string(),
    title: z.string().nullish(),
    domain: z.string().nullish(),
    sourcecountry: z.string().nullish(),
    language: z.string().nullish(),
    seendate: z.string().nullish(),
  })
  .passthrough();

const gdeltResponseSchema = z.object({
  articles: z.array(gdeltArticleSchema).nullish(),
});

export async function fetchGdelt(
  opts: { hoursBack?: number; limit?: number } = {},
): Promise<RawLead[]> {
  const { hoursBack = 24 * 7, limit = 30 } = opts;
  const all: RawLead[] = [];
  for (const { source, query } of QUERIES) {
    try {
      const params = new URLSearchParams({
        query,
        mode: "ArtList",
        format: "json",
        maxrecords: String(limit),
        timespan: `${hoursBack}h`,
        sort: "DateDesc",
      });
      const response = await fetch(`${BASE}?${params}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const text = await response.text();
      if (!text.trim().startsWith("{")) continue;
      const parsed = gdeltResponseSchema.parse(JSON.parse(text));
      const rows = parsed.articles ?? [];
      for (const a of rows) {
        all.push({
          source,
          source_external_id: `${source}:${a.url}`,
          source_url: a.url,
          title: (a.title ?? "Untitled article").slice(0, 280),
          raw_text: [
            `Title: ${a.title ?? ""}`,
            `Domain: ${a.domain ?? ""}`,
            `Country: ${a.sourcecountry ?? ""}`,
            `Language: ${a.language ?? ""}`,
            `Published: ${a.seendate ?? ""}`,
            `Query slice: ${source}`,
            `URL: ${a.url}`,
          ].join("\n"),
          date_discovered: parseGdeltDate(a.seendate) ?? new Date().toISOString(),
          raw_payload: a as Record<string, unknown>,
        });
      }
    } catch (e) {
      logWarn("ingest.gdelt", "GDELT slice request failed", {
        source,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return all;
}

function parseGdeltDate(s?: string | null): string | null {
  if (!s || s.length < 15) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}
