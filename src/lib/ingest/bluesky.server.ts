import { z } from "zod";
import { logWarn } from "../logger.server";
import { loadKeywords } from "./keywords.server";
import { isAmbiguousExtraTerm } from "./medical-gate";
import type { RawLead } from "./types";

const BASE = "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts";
const REQUEST_TIMEOUT_MS = 6_000;
const MAX_QUERIES = 6;

const BASE_QUERIES = [
  '"POCUS" ultrasound',
  '"ultrasound recall"',
  '"VA hospital" ultrasound',
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

type BskyPost = z.infer<typeof bskyPostSchema>;

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

async function runSingleBlueskyQuery(query: string, perQuery: number): Promise<BskyPost[]> {
  const url = `${BASE}?q=${encodeURIComponent(query)}&limit=${perQuery}&sort=latest`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) return [];
  const parsed = bskyResponseSchema.parse(await response.json());
  return parsed.posts ?? [];
}

export async function fetchBluesky(opts: { perQuery?: number } = {}): Promise<RawLead[]> {
  const { perQuery = 12 } = opts;
  const kw = await loadKeywords();
  const vendorQueries = [...kw.vendors, ...kw.products]
    .map(buildBlueskySearchQuery)
    .filter((q): q is string => q !== null)
    .slice(0, 4);
  const queries = Array.from(new Set([...BASE_QUERIES, ...vendorQueries])).slice(0, MAX_QUERIES);

  const settled = await Promise.allSettled(
    queries.map((query) => runSingleBlueskyQuery(query, perQuery)),
  );

  const seen = new Set<string>();
  const results: RawLead[] = [];

  for (let idx = 0; idx < settled.length; idx++) {
    const outcome = settled[idx];
    if (outcome.status === "rejected") {
      logWarn("ingest.bluesky", "Bluesky query failed", {
        query: queries[idx],
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
      continue;
    }
    for (const post of outcome.value) {
      if (seen.has(post.uri)) continue;
      seen.add(post.uri);
      const text = (post.record?.text ?? "").trim();
      if (!text) continue;
      const webUrl = uriToWebUrl(post.uri, post.author?.handle);
      const created = post.record?.createdAt ?? post.indexedAt ?? new Date().toISOString();
      results.push({
        source: "bluesky",
        source_external_id: `bsky:${post.uri}`,
        source_url: webUrl,
        title: text.slice(0, 200),
        raw_text: [
          `Author: ${post.author?.displayName ?? ""} (@${post.author?.handle ?? "anon"})`,
          `Posted: ${created}`,
          `URL: ${webUrl}`,
          "",
          text,
        ].join("\n"),
        date_discovered: created,
        raw_payload: post as Record<string, unknown>,
      });
    }
  }

  return results;
}
