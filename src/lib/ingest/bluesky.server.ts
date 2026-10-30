import { z } from "zod";
import { logWarn } from "../logger.server";
import { loadKeywords } from "./keywords.server";
import { isAmbiguousExtraTerm } from "./medical-gate";
import type { RawLead } from "./types";

const BASE = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";
const REQUEST_TIMEOUT_MS = 15_000;

const BASE_QUERIES = [
  '"POCUS"',
  '"ultrasound recall"',
  '"VA hospital ultrasound"',
  '"point of care ultrasound"',
];

const bskyPostSchema = z
  .object({
    uri: z.string(),
    cid: z.string(),
    author: z
      .object({
        handle: z.string().nullish(),
        displayName: z.string().nullish(),
      })
      .nullish(),
    record: z
      .object({
        text: z.string().nullish(),
        createdAt: z.string().nullish(),
      })
      .nullish(),
    indexedAt: z.string().nullish(),
  })
  .passthrough();

const bskyResponseSchema = z.object({
  posts: z.array(bskyPostSchema).nullish(),
});

function uriToWebUrl(uri: string, handle?: string | null): string {
  const parts = uri.split("/");
  const rkey = parts[parts.length - 1];
  const did = parts[2];
  return `https://bsky.app/profile/${handle || did}/post/${rkey}`;
}

export function buildBlueskySearchQuery(term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed || trimmed.length < 3) return null;
  if (isAmbiguousExtraTerm(trimmed)) {
    return `"${trimmed}" ultrasound`;
  }
  return `"${trimmed}"`;
}

export async function fetchBluesky(opts: { perQuery?: number } = {}): Promise<RawLead[]> {
  const { perQuery = 15 } = opts;
  const kw = await loadKeywords();
  const vendorQueries = [...kw.vendors, ...kw.products]
    .map(buildBlueskySearchQuery)
    .filter((q): q is string => q !== null)
    .slice(0, 8);
  const queries = Array.from(new Set([...BASE_QUERIES, ...vendorQueries]));

  const seen = new Set<string>();
  const results: RawLead[] = [];

  for (const q of queries) {
    try {
      const url = `${BASE}?q=${encodeURIComponent(q)}&limit=${perQuery}&sort=latest`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) continue;
      const parsed = bskyResponseSchema.parse(await response.json());
      for (const p of parsed.posts ?? []) {
        if (seen.has(p.uri)) continue;
        seen.add(p.uri);
        const webUrl = uriToWebUrl(p.uri, p.author?.handle);
        const text = p.record?.text ?? "";
        const created = p.record?.createdAt ?? p.indexedAt ?? new Date().toISOString();
        results.push({
          source: "bluesky",
          source_external_id: `bsky:${p.uri}`,
          source_url: webUrl,
          title: text.slice(0, 200) || `Bluesky post by ${p.author?.handle ?? "anon"}`,
          raw_text: [
            `Author: ${p.author?.displayName ?? ""} (@${p.author?.handle ?? "anon"})`,
            `Posted: ${created}`,
            `Query: ${q}`,
            `URL: ${webUrl}`,
            "",
            text,
          ].join("\n"),
          date_discovered: created,
          raw_payload: p as Record<string, unknown>,
        });
      }
    } catch (e) {
      logWarn("ingest.bluesky", "Bluesky query failed", {
        query: q,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
