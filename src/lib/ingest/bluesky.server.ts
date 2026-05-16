import type { RawLead } from "./types";
import { loadKeywords } from "./keywords.server";

// Free Bluesky public search — no auth required.
const BASE = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";

const BASE_QUERIES = [
  '"POCUS"',
  '"ultrasound recall"',
  '"VA hospital ultrasound"',
  '"point of care ultrasound"',
];

interface BskyPost {
  uri: string;
  cid: string;
  author?: { handle?: string; displayName?: string };
  record?: { text?: string; createdAt?: string };
  indexedAt?: string;
}

interface BskyResponse {
  posts?: BskyPost[];
}

function uriToWebUrl(uri: string, handle?: string): string {
  // at://did:plc:xxx/app.bsky.feed.post/abc123 → https://bsky.app/profile/<handle>/post/<rkey>
  const parts = uri.split("/");
  const rkey = parts[parts.length - 1];
  const did = parts[2];
  return `https://bsky.app/profile/${handle ?? did}/post/${rkey}`;
}

export async function fetchBluesky(opts: { perQuery?: number } = {}): Promise<RawLead[]> {
  const { perQuery = 15 } = opts;
  const kw = await loadKeywords();
  // Build vendor/product-specific queries on top of the base ones.
  const vendorQueries = [...kw.vendors, ...kw.products].slice(0, 8).map((v) => `"${v}"`);
  const queries = Array.from(new Set([...BASE_QUERIES, ...vendorQueries]));

  const seen = new Set<string>();
  const results: RawLead[] = [];

  for (const q of queries) {
    try {
      const url = `${BASE}?q=${encodeURIComponent(q)}&limit=${perQuery}&sort=latest`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) continue;
      const json = (await res.json()) as BskyResponse;
      for (const p of json.posts ?? []) {
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
          raw_payload: p as unknown as Record<string, unknown>,
        });
      }
    } catch (e) {
      console.error(`bluesky q=${q} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return results;
}
