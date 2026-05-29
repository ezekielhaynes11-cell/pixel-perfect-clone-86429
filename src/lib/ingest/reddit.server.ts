import type { RawLead } from "./types";
import { loadKeywords, matchesAnyKeyword } from "./keywords.server";

// Free Reddit JSON API — no auth required. ~60 req/min/IP with a custom UA.
const SUBS = [
  "emergencymedicine",
  "IcuRn",
  "Radiology",
  "POCUS",
  "medicine",
  "anesthesiology",
  "medlabprofessionals",
];

const UA = "PhilipsLeadRadar/1.0";

interface RedditPost {
  id: string;
  title: string;
  selftext?: string;
  permalink: string;
  created_utc: number;
  subreddit: string;
  author?: string;
  url?: string;
}

interface RedditListing {
  data?: {
    children?: Array<{ data?: RedditPost }>;
  };
}

export async function fetchReddit(opts: { perSub?: number } = {}): Promise<RawLead[]> {
  const { perSub = 25 } = opts;
  const kw = await loadKeywords();
  const matchTerms = Array.from(
    new Set([...kw.vendors, ...kw.products, ...kw.focusConcepts, ...kw.complaintSignals]),
  );

  const results: RawLead[] = [];
  for (const sub of SUBS) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=${perSub}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as RedditListing;
      const posts = (json.data?.children ?? []).map((c) => c.data).filter(Boolean) as RedditPost[];
      for (const p of posts) {
        const haystack = `${p.title}\n${p.selftext ?? ""}`;
        const hits = matchesAnyKeyword(haystack, matchTerms);
        if (hits.length === 0) continue;
        const permalink = `https://www.reddit.com${p.permalink}`;
        results.push({
          source: "reddit",
          source_external_id: `reddit:${p.id}`,
          source_url: permalink,
          title: p.title.slice(0, 280),
          raw_text: [
            `Subreddit: r/${p.subreddit}`,
            `Author: ${p.author ?? "anon"}`,
            `Posted: ${new Date(p.created_utc * 1000).toISOString()}`,
            `Matched terms: ${hits.join(", ")}`,
            `URL: ${permalink}`,
            "",
            "Title:",
            p.title,
            "",
            "Body:",
            (p.selftext ?? "").slice(0, 1800),
          ].join("\n"),
          date_discovered: new Date(p.created_utc * 1000).toISOString(),
          raw_payload: p as unknown as Record<string, unknown>,
        });
      }
    } catch (e) {
      console.error(`reddit r/${sub} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return results;
}
