## Three small fixes

### 1. Remove the "enriched X" message from the refresh toast
`src/routes/index.tsx` line 80 — change the success toast from
`Found N new leads · enriched X` to just `Found N new leads`. Drop the unused `enriched` reduction.

### 2. Fix "Daily sync · 7am & 1pm PT" PST label
Same file, line 184 (the fallback shown when there are no runs yet) hard-codes "PT". Replace it with a neutral `Awaiting first sync…`. The "Last scan: Xm ago" line (236-251) already uses relative time and doesn't show PST.

### 3. Fix `triggerIngestion` 504 upstream timeout
Root cause: `runIngestion()` runs 8 sources sequentially in one server function call. The Cloudflare Worker times out at ~60s, but Supabase keeps processing in the background — so leads do show up, but the user sees `upstream request timeout` and an error toast.

Fix (minimal, no new infra):
- Split the single `triggerIngestion` server fn into a per-source variant: `triggerIngestionForSource({ source })` that calls the existing internal logic for just one source (one loop iteration from `run.server.ts`). Refactor `runIngestion` to export a `runIngestionForSource(name)` helper; keep the all-in-one `runIngestion()` for the existing pg_cron `/api/public/ingest` route.
- Client `Refresh feed` button: fan out — call `triggerIngestionForSource` once per source in parallel (with `Promise.allSettled`), each finishes well under the 60s limit. Show progress as each completes; the existing `runsQ` polling already drives the "Last scan" indicator.
- Each per-source call still records its own `ingestion_runs` row, so the dashboard "Last scan" updates as sources finish.

### Files touched
- `src/lib/ingest/run.server.ts` — export `runIngestionForSource(name)`; existing `runIngestion()` becomes a thin loop over it.
- `src/lib/leads.functions.ts` — add `triggerIngestionForSource` server fn (validated with zod), keep `triggerIngestion` for backward compat.
- `src/routes/index.tsx` — (a) remove "enriched X" from toast, (b) replace PT fallback string, (c) change the `ingest` mutation to fan out per source.

No schema or secret changes. No new dependencies.