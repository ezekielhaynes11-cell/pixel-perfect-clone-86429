# Why nothing is showing

The `leads` table is empty (0 rows) and there are **0 ingestion_runs** ever recorded. The dashboard renders correctly — it shows the "No leads yet. Click Refresh feed…" empty state — but no SAM.gov / FDA / news fetch has been triggered yet, so there is nothing to display.

Clicking **Refresh feed** in the header should populate it. If that already fails silently for you, the plan below also surfaces the failure.

# Plan

1. **Auto-trigger first ingestion on load.** In `src/routes/index.tsx`, when `leadsQ` finishes loading and returns 0 rows AND no ingestion has ever run, fire `ingest.mutate()` once. Guarded by a `useRef` so it never loops.

2. **Surface ingestion errors in-page.** Today errors only go to a toast that disappears. Add a small red banner above the lead feed when `ingest.isError` is true, showing `ingest.error.message` so you can see exactly which source failed (SAM.gov auth, FDA timeout, Lovable AI quota, etc.).

3. **Show last ingestion status.** Under the header, render a one-line "Last scan: 2m ago · 12 new · 8 enriched" pulled from `getRecentIngestionRuns` so it's obvious when the feed last ran and whether it succeeded.

4. **No backend or schema changes.** Server functions, RLS, and ingestion logic stay as-is. Pure frontend wiring.

# Out of scope

- Scheduled/cron ingestion (can add later via `pg_cron` hitting `/api/public/ingest`).
- Retrying individual failed sources.

# Open question

Do you want me to **also** trigger an ingestion right now from my side so you can see real data immediately after the code change ships, or just wire the auto-trigger and let it run on your next page load?
