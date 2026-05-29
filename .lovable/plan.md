## Why the cards still show no emails

The DB confirms the root cause:
- 6 `physician_contacts` rows exist
- 0 have `email`
- 0 have `apollo_enriched_at`
- Recent ingestion runs all report `new_count = 0`

The previous change only triggers Apollo *inside* `attachPhysiciansToLead`. That code path runs only when a brand-new physician is being linked to a lead. Since ingestion finds nothing new, the auto-enrich never fires, and the existing 6 physicians stay un-enriched forever. Hitting "Refresh feed" produces zero Apollo calls — matching the empty server logs.

## Fix: backfill sweep on every ingestion + on demand

Add a small backfill that enriches any physician already linked to a lead but missing Apollo data, gated by the same daily cap.

### 1. `src/lib/apollo/service.server.ts` — add `backfillApolloForLinkedPhysicians`

New exported function:
- Query `physician_contacts` where `apollo_enriched_at IS NULL` AND `apollo_id IS NULL` AND `npi NOT LIKE 'APL-%'`.
- Only include NPIs that appear in `lead_physicians` (so we don't enrich orphans).
- Cap the batch (e.g. 25 per call) to stay safe.
- For each, call `tryConsumeApolloCall()`; if false, stop and log once.
- Call `apolloEnrichPhysician({ npi })` inside try/catch, 300 ms pacing.
- Return `{ attempted, matched, skippedCap }`.

### 2. `src/lib/ingest/run.server.ts` — call backfill at end of run

After the existing `enrichPending` loop in `runIngestion` (and `runIngestionForSource`), invoke `backfillApolloForLinkedPhysicians()` once. Wrap in try/catch; log summary. This guarantees every "Refresh feed" click also catches up the previously-missed contacts.

### 3. `src/lib/leads.functions.ts` — one-shot manual trigger

Add `triggerApolloBackfill = createServerFn(...)` that simply calls `backfillApolloForLinkedPhysicians({ limit: 50 })`. Returns counts. No UI wiring required for this task, but useful from copilot/devtools so the user can force enrichment of the current 6 rows immediately without waiting for the next ingestion run.

### 4. No UI changes

`LeadCard` already renders email/title/LinkedIn the moment those columns populate. Once the backfill runs successfully, the cards will surface contacts on next page load (TanStack Query refetch).

## Verification

1. Click "Refresh feed" once → server logs show `backfillApolloForLinkedPhysicians` activity and per-NPI Apollo calls.
2. `SELECT npi, email, apollo_enriched_at FROM physician_contacts` shows non-null `apollo_enriched_at` (and emails where Apollo had a match) for the 6 rows.
3. Reload `/` → top physician on each LeadCard shows ✉️ email / LinkedIn / phone inline.
4. Re-run ingestion → backfill returns `attempted: 0` (idempotent fast-path in `apolloEnrichPhysician` already skips).

## Out of scope

- No new DB migrations, no schema changes.
- No changes to `apollo/client.server.ts` or NPPES logic.
- No changes to the daily-cap module.
- Bulk-enrich button stays as-is.

## Risk

If Apollo returns no match for these 6 NPIs (some look incomplete, e.g. `-- RAVINDER KAUR`), `apollo_enriched_at` will stay null and the card stays empty. That's an Apollo data-quality limit, not a code bug — the logs will say "No Apollo match for this physician."
