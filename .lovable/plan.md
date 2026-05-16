## Switch rep territory: California → Oklahoma, Arkansas, Louisiana, Texas

Currently the app is hardcoded to California in three places: the CMS Open Payments fetcher, the dashboard header label, and a placeholder string. The schema default for `profiles.territory` is also `'california'`. National sources (SAM.gov, openFDA, GDELT, ClinicalTrials) already return nationwide signal and will continue to — the AI enricher already infers the state per lead, so OK/AR/LA/TX leads will surface naturally and get the right `territory` tag.

### Changes

1. **CMS Open Payments — fetch all four states**
   `src/lib/ingest/run.server.ts` currently calls `fetchCmsOpenPayments({ territoryState: "CA" })` once. Replace with four sequential calls (OK, AR, LA, TX) merged into one `cms_open_payments` source entry so the run summary stays clean. Volume stays modest because each state is filtered server-side by CMS.

2. **Dashboard territory label**
   `src/components/dashboard/SummaryCard.tsx` line 66: `"Live · Territory: California"` → `"Live · Territory: OK · AR · LA · TX"`.

3. **Saved-search placeholder copy**
   `src/components/dashboard/SavedSearchesDrawer.tsx` line 111: `'e.g. "California cath labs"'` → `'e.g. "Texas cath labs"'`.

4. **Profile default territory (DB migration)**
   Change `public.profiles.territory` default from `'california'` to `'texas'` (representative state — multi-state coverage is conveyed in the UI label, not in the single-string column). No existing rows need backfill since this is single-user mode and the owner row will be updated to `'texas'`.

5. **Enricher hint text (minor)**
   `src/lib/ingest/enrich.server.ts` line 21 example list mentions `"california", "texas"` — swap to `"texas", "oklahoma"` so the model's example aligns with the active territory.

### Out of scope

- No new filtering that drops out-of-territory leads. The user already has access to national signals via the filter bar; auto-hiding them would silently shrink the feed.
- No change to the twice-daily cron schedule.
- No change to NPPES enrichment (it already uses the per-lead inferred state code).

### Files touched

- `src/lib/ingest/run.server.ts` — fan CMS call across 4 states
- `src/components/dashboard/SummaryCard.tsx` — label
- `src/components/dashboard/SavedSearchesDrawer.tsx` — placeholder
- `src/lib/ingest/enrich.server.ts` — example states in prompt
- 1 migration — change `profiles.territory` default
