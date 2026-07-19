import type { RawLead } from "./types";

// Free RSS feeds — VA News + HRSA press releases. Filtered by territory + imaging keywords.
const FEEDS = [
  { url: "https://news.va.gov/feed/", label: "VA News" },
  { url: "https://www.hrsa.gov/about/news/press-releases/rss.xml", label: "HRSA" },
];

const TERRITORY_RX = /\b(texas|oklahoma|arkansas|louisiana|TX|OK|AR|LA)\b/i;
const TOPIC_RX =
  /\b(imaging|ultrasound|modernization|equipment|rural hospital|capital|grant|expansion|fellowship|cath|monitor)\b/i;

interface FeedItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function pick(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!m) return "";
  return decodeEntities(
    m[1]
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<[^>]+>/g, "")
      .trim(),
  );
}

function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const rx = /<item[\s>][\s\S]*?<\/item>/gi;
  const matches = xml.match(rx) ?? [];
  for (const block of matches) {
    items.push({
      title: pick(block, "title"),
      link: pick(block, "link"),
      description: pick(block, "description"),
      pubDate: pick(block, "pubDate"),
      guid: pick(block, "guid"),
    });
  }
  return items;
}

export async function fetchFundingRss(): Promise<RawLead[]> {
  const out: RawLead[] = [];
  for (const f of FEEDS) {
    try {
      const res = await fetch(f.url, { headers: { "User-Agent": "PhilipsLeadRadar/1.0" } });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseRss(xml);
      for (const it of items) {
        const haystack = `${it.title} ${it.description ?? ""}`;
        if (!TOPIC_RX.test(haystack)) continue;
        // Territory match is a soft filter — keep VA-wide items when topic matches "VA" / "modernization".
        const territoryHit = TERRITORY_RX.test(haystack);
        const isVaTopic = /\b(VA|Veterans Affairs)\b/i.test(`${f.label} ${haystack}`);
        if (!territoryHit && !isVaTopic) continue;

        const id = it.guid || it.link || it.title;
        const date = it.pubDate ? new Date(it.pubDate).toISOString() : new Date().toISOString();
        out.push({
          source: "funding_rss",
          source_external_id: `funding_rss:${id}`,
          source_url: it.link,
          title: it.title.slice(0, 280),
          raw_text: [
            `Feed: ${f.label}`,
            `Published: ${date}`,
            `URL: ${it.link}`,
            "",
            it.title,
            "",
            (it.description ?? "").slice(0, 1500),
          ].join("\n"),
          date_discovered: date,
          raw_payload: { ...it, feed: f.label },
        });
      }
    } catch (e) {
      console.error(`funding_rss ${f.url} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return out;
}
