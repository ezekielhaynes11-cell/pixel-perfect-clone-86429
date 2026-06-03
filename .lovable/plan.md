## Goal
Trigger the live ingestion pipeline for SAM.gov and ClinicalTrials.gov, confirm the TX/OK/AR/LA territory filters are applied, and report how many rows landed in `public.leads` (or surface the API error).

## Approach
Invoke the existing server-side ingestion logic directly — no code changes needed. The repo already has:
- `runIngestionForSource(name)` in `src/lib/ingest/run.server.ts`
- Public trigger route `POST /api/public/ingest` (requires `apikey` header = `SUPABASE_PUBLISHABLE_KEY`)
- Territory filters already enforced inside `sam-gov.server.ts` and `clinicaltrials.server.ts` (TX/OK/AR/LA)

## Steps
1. **Baseline counts** — query `leads` grouped by source (`sam_gov`, `clinicaltrials`) for current row count + max `date_ingested`.
2. **Run SAM.gov ingestion** — call the deployed server endpoint (or invoke the server function) for source `sam_gov`. Capture `{ fetched, inserted, enriched, error }`.
3. **Run ClinicalTrials ingestion** — same, for source `clinicaltrials`.
4. **Verify territory filter** — `SELECT territory, count(*) FROM leads WHERE source IN ('sam_gov','clinicaltrials') AND date_ingested > <baseline>` and confirm only TX/OK/AR/LA appear.
5. **Inspect `ingestion_runs`** — read the two newest rows for these sources to get `status`, `fetched_count`, `new_count`, `enriched_count`, `error`.
6. **Report back** — per source: fetched / inserted / enriched, territory breakdown of new rows, and any API error message verbatim. No code or schema changes.

## Notes
- If `SAM_GOV_API_KEY` is missing or rejected, SAM.gov returns 0 fetched with an error string — I'll surface it.
- ClinicalTrials.gov is keyless; failures will be HTTP errors from `clinicaltrials.gov/api/v2/studies`.
- Nothing in `supabase/functions/enrich-contact` or other code is modified.
