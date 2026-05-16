import type { RawLead } from "./types";

// GDELT 2.1 DOC API — free, no key.
const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

const QUERY = [
  '("hospital" OR "health system" OR "medical center")',
  '("capital budget" OR "expansion" OR "fellowship" OR "new wing" OR "ribbon cutting" OR "groundbreaking" OR "imaging center")',
  "sourcecountry:US",
].join(" ");

export async function fetchGdelt(opts: { hoursBack?: number; limit?: number } = {}): Promise<RawLead[]> {
  const { hoursBack = 24 * 7, limit = 40 } = opts;
  const params = new URLSearchParams({
    query: QUERY,
    mode: "ArtList",
    format: "json",
    maxrecords: String(limit),
    timespan: `${hoursBack}h`,
    sort: "DateDesc",
  });
  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`GDELT ${res.status}`);
  const text = await res.text();
  let json: { articles?: GdeltArticle[] } = {};
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const rows = json.articles ?? [];

  return rows.map((a): RawLead => ({
    source: "gdelt",
    source_external_id: a.url,
    source_url: a.url,
    title: a.title ?? "Untitled article",
    raw_text: [
      `Title: ${a.title}`,
      `Domain: ${a.domain}`,
      `Country: ${a.sourcecountry}`,
      `Language: ${a.language}`,
      `Published: ${a.seendate}`,
      `URL: ${a.url}`,
    ].join("\n"),
    date_discovered: parseGdeltDate(a.seendate) ?? new Date().toISOString(),
    raw_payload: a as unknown as Record<string, unknown>,
  }));
}

function parseGdeltDate(s?: string): string | null {
  // GDELT seendate format: 20260516T120000Z
  if (!s || s.length < 15) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}

interface GdeltArticle {
  url: string;
  title?: string;
  domain?: string;
  sourcecountry?: string;
  language?: string;
  seendate?: string;
}
