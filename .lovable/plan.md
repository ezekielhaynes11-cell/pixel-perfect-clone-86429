## Auto-enrich physicians with Apollo at ingestion (with daily cap)

### Goal
Every physician attached to a newly enriched lead gets an Apollo lookup automatically during ingestion, so emails / titles / LinkedIn badges show up on the main feed without clicking "Bulk enrich". A daily cap keeps Apollo credit usage bounded.

### Changes

**1. `src/lib/ingest/nppes.server.ts` — `attachPhysiciansToLead`**
- After each successful `physician_contacts` upsert, if the cached row does not already have `apollo_enriched_at` AND the NPI does not start with `APL-`, call `apolloEnrichPhysician({ npi })` inline.
- Wrap the Apollo call in its own `try/catch` — a failure (rate limit, 402 credits, 403 endpoint) never breaks NPPES linkage. Log status only.
- Sequential, ~300ms gap between Apollo calls (same pattern as `bulkEnrichApollo`).
- Honor the shared daily cap (see step 3). When cap is hit, skip Apollo for the rest of the run and log once.
- Import `apolloEnrichPhysician` from `@/lib/apollo/service.server`.

**2. `src/lib/apollo/service.server.ts` — `apolloEnrichPhysician`**
- Add an idempotent fast-path: if `existing.apollo_id` or `existing.apollo_enriched_at` is already set, return `{ skipped: true }` without calling Apollo.
- Existing return shape extended with optional `skipped` boolean — no caller break.

**3. New `src/lib/apollo/quota.server.ts` — in-process daily cap**
- Module-scope counter `{ dayKey: "YYYY-MM-DD", count: number }`, default cap **150 calls/day** (configurable via `APOLLO_DAILY_CAP` env var, read at call time).
- Exports `tryConsumeApolloCall(): boolean` — increments and returns false when cap is reached for the current UTC day.
- Exports `getApolloUsage(): { used, cap, dayKey }` for diagnostics / future UI surfacing.
- Caveat (documented in file header): Worker isolates may reset the counter independently; this is a best-effort soft cap, not a hard distributed limit. Acceptable for current ingestion volume; can be upgraded to a DB-backed counter later if needed.

**4. `src/lib/ingest/run.server.ts`**
- No structural change — `enrichPending` already calls `attachPhysiciansToLead`. Once (1) is in place, every newly enriched lead automatically gets Apollo-enriched physicians.
- Add a single debug log per lead: `{ leadId, attached, apolloAttempted, apolloMatched, apolloSkippedCapped }`.

**5. `src/components/dashboard/LeadCard.tsx` — surface contacts on first load**
- Currently emails / LinkedIn / phone are hidden behind the collapsible "N Physicians" toggle.
- Change defaults:
  - If `physicians.length === 1`, expand the list by default.
  - Always render a compact inline contact row above the toggle with the top physician's email + LinkedIn icon + phone (when present), so contact info is visible without clicking.
- No new data fetches — `listLeadPhysicians` already returns `email`, `title`, `linkedin_url`, `apollo_enriched_at`.

### Out of scope
- No DB migrations.
- No new tools or buttons.
- No changes to `apollo/client.server.ts` (already logs status + body).
- Bulk-enrich button stays as manual backfill for old leads.

### Technical notes
- Daily cap is per-Worker-isolate in-memory. With Cloudflare's typical isolate reuse this is "good enough" to prevent runaway burns from a single ingestion run, but is not a strict cluster-wide cap. If stricter caps are needed later, swap `quota.server.ts` to insert/select against a small `apollo_usage(day, count)` table.
- Per ingestion run estimate: ~20 leads × 1–3 physicians ≈ up to 60 Apollo calls. Default cap 150/day → ~2.5 refresh runs/day before backoff. Tunable via `APOLLO_DAILY_CAP`.

### Verification
1. Trigger ingestion (Refresh feed). Check `server-function-logs` for per-lead summary lines and `apolloEnrichPhysician` activity.
2. `read_query` `physician_contacts` for newly attached NPIs — `apollo_enriched_at` should be set.
3. Reload `/` — top physician on each LeadCard shows ✉️ email / LinkedIn / phone inline, no manual click required.
4. Re-run ingestion — no duplicate Apollo calls (idempotent fast-path).
5. Force cap (temporarily set `APOLLO_DAILY_CAP=1`) → logs show "apollo daily cap reached, skipping" and ingestion still completes.
