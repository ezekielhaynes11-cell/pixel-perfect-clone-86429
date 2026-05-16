## Free-tier build — ship everything that costs nothing

All items below use APIs we already pay for (Lovable AI, Supabase) or free public endpoints. No new paid services.

### 1. New free data sources

**a. Reddit adapter** (`src/lib/ingest/reddit.server.ts`)
- Hit `https://www.reddit.com/r/{sub}/new.json?limit=50` for: `emergencymedicine`, `IcuRn`, `Radiology`, `POCUS`, `medicine`, `anesthesiology`, `medlabprofessionals`.
- Custom `User-Agent: PhillipsLeadRadar/1.0`.
- Filter posts whose title/body matches vendor names (GE, Mindray, SonoSite, Samsung, Canon, Siemens, Fuji) OR equipment keywords OR complaint signals ("what should we replace", "frustrated with", "looking to buy").
- Each match → RawLead → existing AI enricher.

**b. Bluesky adapter** (`src/lib/ingest/bluesky.server.ts`)
- Public search: `https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=...`.
- Queries: `"POCUS"`, `"ultrasound recall"`, `"Mindray TE7"`, `"SonoSite"`, `"Venue Fit"`, `"VA hospital ultrasound"`.
- Free, no auth, rate-limited but fine for 2× daily.

**c. VA / HRSA funding adapter** (`src/lib/ingest/funding-rss.server.ts`)
- Parse public RSS feeds:
  - `https://news.va.gov/feed/` (filter by territory keywords + "imaging" / "modernization" / "equipment")
  - `https://www.hrsa.gov/about/news/press-releases/rss.xml` (rural grants)
- Lightweight XML parse, no library needed beyond a regex extractor (kept inline to avoid Worker-incompat deps).

**d. Tuned GDELT slices** (add two new queries to `gdelt.server.ts`)
- Vendor M&A: `("acquisition" OR "manufacturing" OR "offshoring" OR "end of life" OR "EOL") AND ("GE Healthcare" OR Mindray OR Samsung OR Canon OR Siemens OR SonoSite OR Fujifilm)`.
- Rural/VA funding: `("rural hospital" OR "Veterans Affairs" OR "VA hospital" OR "HRSA grant" OR "capital campaign") AND (Texas OR Oklahoma OR Arkansas OR Louisiana)`.
- Each becomes its own `source` value so the rep can filter on it.

**e. Free hospital/fellowship page scraper** (`src/lib/ingest/scrape-url.server.ts`)
- Server function `scrapeUrlForAccount({url, accountId})` — plain `fetch()` + strip HTML to text + AI extracts people/roles/programs into structured JSON.
- "Add page" button in the (new) account view lets Mike paste any URL — fellowship pages, leadership pages, individual LinkedIn profiles he wants tracked.

### 2. Vendor + product taxonomy (DB + UI)

- Migration: `keyword_lists` table with `(kind: 'vendor' | 'product_model' | 'focus_concept' | 'role_title', value, active)`. Seed with the full PRD §3 list (Venue/Venue Fit/Venue Go, TE7/Max/TE8/M9, LX/PX/S2, POCUS, non-invasive cardiac output, etc.).
- All adapters import these instead of the hardcoded `PHILLIPS_KEYWORDS` constant.
- New `/settings/keywords` page where Mike can add/edit/disable terms — no dev needed.

### 3. Better lead enrichment & filters

- Extend `EnrichmentResult` + `leads` table with:
  - `vendor_mentions text[]` (extracted vendor models)
  - `account_type text` (`va` | `non_va` | `unknown`) — AI infers from hospital name / domain
  - `signal_type text` (`recall` | `rfp` | `funding` | `expansion` | `sentiment` | `m_and_a` | `incumbency`)
- Update the AI tool schema + system prompt accordingly.
- **FilterBar additions**: State (TX/OK/AR/LA + Other), Account type (VA / Non-VA), Vendor model, Signal type. Sticky bar already exists — just add chips.

### 4. Role-aware physician tagging

- Extend enricher to also extract a per-physician role hint (`pocus_director`, `fellowship_director`, `biomed`, `chief`, `attending`).
- New nullable column `lead_physicians.role_hint`.
- Surface as a small badge under each name in the LeadCard physician list.

### 5. Account deep-dive

- Migration: `accounts` table (`id, name, state, account_type, system, notes`), plus `account_id` FK on `leads`.
- Backfill by hospital-name fuzzy match (run once via insert tool).
- New route `/accounts/$id`: header (name, state, VA flag, vendor footprint chips) → tabs: **Leads**, **People** (deduped physicians), **Pages** (URLs Mike scraped).

### 6. Switch-pitch outreach

- When source = `openfda` (recall) or `signal_type = 'm_and_a'`, the outreach drafter switches to a "stable alternative" template that explicitly names the incumbent vendor and the recall/event.
- One new prompt variant in `src/lib/outreach.server.ts`. No new UI.

### 7. Morning Gmail digest

- New server route `/api/public/cron/morning-digest`.
- pg_cron job @ 7:15am PT → calls route → builds top-10 leads markdown → sends via the already-wired Gmail connector to Mike's address (read from `profiles.email`).
- Includes one-line "today's plays" header + per-lead trigger reason + tel link.

### 8. Keyword-driven Reddit/Bluesky alerts (free)

- Saved-search alerts already exist for confidence threshold; extend the matcher so a saved search like "Texas VA POCUS" also fires when a new Reddit/Bluesky/funding lead matches its filter — not just confidence ≥ N.

---

### What this explicitly does NOT do (requires payment — defer)

- Apollo (verified emails / mobile / title-change alerts)
- X / Twitter API
- LinkedIn auto-monitoring (only manual paste-a-URL works free)
- Facebook private groups
- SFDC integration

### Order of execution

1. Keyword taxonomy table + seed (unblocks everything else)
2. Reddit + Bluesky + funding RSS + GDELT M&A/VA adapters
3. Enricher schema extensions (vendor_mentions, account_type, signal_type, role_hint)
4. FilterBar additions
5. Switch-pitch outreach variant
6. Accounts table + `/accounts/$id` page + URL scraper
7. Morning Gmail digest cron
8. Saved-search alert matcher extension
9. `/settings/keywords` editor UI

Approve and I'll execute end-to-end in one pass.
