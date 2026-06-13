// Pure, client-safe helpers for cleaning dirty ingested lead data before
// display. Ingestion pulls from many noisy public sources (FDA, GDELT news,
// Reddit, etc.), so titles can contain raw/encoded URLs, emojis, foreign-language
// text, stray punctuation, and near-duplicate recall listings. These helpers
// normalize that at the display layer; they never mutate the database.

// Covers the common emoji blocks plus variation selectors / zero-width joiners.
const EMOJI_RE =
  /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

// Bare URLs (http/https or www.) embedded in a title.
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;

function decodePercentEncoding(s: string): string {
  // Decode runs of %XX sequences (e.g. "%20%E2%80%94"); leave malformed input
  // alone rather than throwing.
  return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (m) => {
    try {
      return decodeURIComponent(m);
    } catch {
      return " ";
    }
  });
}

/**
 * Clean a raw lead title for display:
 * - decode percent-encoded text and strip embedded URLs
 * - remove emojis and stray trailing "#"
 * - remove spaces before commas/colons/semicolons ("garrisons ," -> "garrisons,")
 * - drop dangling "- By" / "— By" fragments ("Pfluger Fly - By" -> "Pfluger Fly")
 * - collapse repeated whitespace
 */
export function cleanLeadTitle(raw: string | null | undefined): string {
  if (!raw) return "Untitled lead";
  let t = decodePercentEncoding(String(raw));
  t = t.replace(URL_RE, " ");
  t = t.replace(EMOJI_RE, " ");
  // Remove whitespace before punctuation: "By : June 5 , 2026" -> "By: June 5, 2026".
  t = t.replace(/\s+([,;:])/g, "$1");
  t = t.replace(/\s{2,}/g, " ");
  // Drop a dangling "- By" / "— By" / "# By" left over from broken headlines.
  t = t.replace(/\s*[#–—-]\s*by\s*$/i, "");
  // Strip leading/trailing separators and stray "#".
  t = t.replace(/^[\s#–—-]+/, "").replace(/[\s#]+$/g, "");
  t = t.trim();
  return t || "Untitled lead";
}

const HOSPITAL_BLANKS = new Set([
  "",
  "unknown",
  "unspecified",
  "n/a",
  "na",
  "none",
  "null",
  "tbd",
]);

const HOSPITAL_NOT_IDENTIFIED = "Hospital not identified";

/**
 * Normalize a hospital value, replacing blank / "Unknown" / "(Unspecified)"
 * placeholders with a single consistent label.
 */
export function cleanHospital(raw: string | null | undefined): string {
  const h = (raw ?? "").trim();
  const key = h.toLowerCase().replace(/[()]/g, "").trim();
  if (HOSPITAL_BLANKS.has(key)) return HOSPITAL_NOT_IDENTIFIED;
  return h;
}

export { HOSPITAL_NOT_IDENTIFIED };

// Distinctly-German words used as a lightweight language signal. Deliberately
// excludes tokens that collide with common English words (e.g. "die", "im",
// "am", "der") to avoid mislabeling English medical text as non-English.
const GERMAN_HINTS =
  /\b(und|oder|für|nicht|auch|werden|wird|eine|einer|einen|durch|über|gegen|zur|zum|Gesundheit|Krankenhaus|Unternehmen|Medizintechnik|Studie|Geräte)\b/gi;

/**
 * Heuristic detector for non-English (currently German) lead text, used to hide
 * items like the German Siemens Healthineers listing from an English feed.
 */
export function isLikelyNonEnglish(text: string | null | undefined): boolean {
  if (!text) return false;
  if (/[äöüßÄÖÜ]/.test(text)) return true;
  const matches = text.match(GERMAN_HINTS);
  return !!matches && matches.length >= 2;
}

/**
 * Build a normalized signature for collapsing near-duplicate listings (e.g.
 * repeated FDA recall entries that differ only by recall number or class).
 * Returns the first dozen significant words of the title.
 */
export function leadDedupeKey(title: string): string {
  const k = title
    .toLowerCase()
    // Drop recall identifiers / class markers that vary between duplicates.
    .replace(/\bclass\s+(?:i{1,3}|[123])\b/g, " ")
    .replace(/\bz-?\d{3,}\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return k.split(" ").slice(0, 12).join(" ");
}
