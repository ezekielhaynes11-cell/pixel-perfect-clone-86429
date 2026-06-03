## Task 1 — Production Supabase keys

Current state:
- `.env` now contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (the publishable key — Supabase's modern equivalent of the anon key; safe to ship).
- `.gitignore` no longer excludes `.env`, so the file ships to the build.
- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which already injects `VITE_*` into the client bundle. No vite.config changes needed (adding plugins/define manually would break it).
- `src/integrations/supabase/client.ts` is auto-generated and cannot be edited.

Changes:
1. Add `src/integrations/supabase/env-check.ts` — a tiny module that reads `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` at module load and, if either is missing, logs a loud `console.error` banner (`[FATAL] Supabase env missing in production bundle — published site will be empty`). Import it once from `src/router.tsx` so it runs on every client boot.
2. Verify the published bundle by `curl`ing the live JS chunk and grepping for the project ref `apaelmfluoqonmskcxjr` after the next publish.

Note on naming: the user asked for `VITE_SUPABASE_ANON_KEY`. This project's generated client reads `VITE_SUPABASE_PUBLISHABLE_KEY` (same JWT, new Supabase naming). I will keep the publishable key as the canonical var and also mirror the value into `VITE_SUPABASE_ANON_KEY` in `.env` so both names work for any third-party code that expects the legacy name.

## Task 2 — Medical-only ingestion gate

Current state:
- All sources funnel through `persistRaws()` in `src/lib/ingest/run.server.ts`, which inserts every fetched item with `confidence: 0, enriched: false`. Enrichment (LLM) then runs over those rows.
- `loadKeywords()` in `src/lib/ingest/keywords.server.ts` already returns a curated vendor/product/focus list (POCUS, ultrasound, cath lab, etc.) but it is only consulted during enrichment scoring — never as a hard gate.

Changes in `src/lib/ingest/run.server.ts`:
1. Add a `MEDICAL_GATE` term list at module scope: `ultrasound`, `pocus`, `echocard`, `sonograph`, `cath lab`, `radiolog`, `cardiolog`, `emergency medicine`, `hospital`, `health system`, `medical center`, `clinic`, `physician`, `nurse`, `va medical`, `va healthcare`, `imaging`, `mri`, `ct scan`, `biomed`, `medtech`, plus the active vendor/product/focus terms from `loadKeywords()`.
2. New helper `passesMedicalGate(raw: RawLead): boolean` that lowercases `title + raw_text + source_url` and returns true iff at least one term hits. Sources already known to be domain-pure (`openfda`, `clinicaltrials`, `cms_open_payments`, `nppes`) bypass the gate; the noisy sources (`gdelt*`, `reddit`, `bluesky`, `funding_rss`, `sam_gov`) are gated.
3. In `persistRaws()`, drop any raw that fails the gate **before** the `insert` call and log a single counter per run (`gated_out: N`). This prevents both the DB write and the downstream LLM enrichment (which only fires for inserted rows).
4. Surface the count on the returned `IngestionSummary` as an optional `gated` field so the ingest UI can show it (no schema change required).

## Task 3 — UI default confidence 50 → 75

Change in `src/components/dashboard/FilterBar.tsx`:
- `emptyFilters.minConfidence: 50` → `75`. This is the single source of truth; `src/routes/index.tsx` consumes it via `useState<Filters>(emptyFilters)`.

## Verification

- Build: rely on the harness's auto build.
- Manual: publish → curl the live HTML/JS for the project ref; open `/` and confirm the slider shows 75% by default; trigger an ingestion run from the admin UI and check `ingestion_runs.fetched_count` vs `new_count` to confirm gating drops are visible.

## Out of scope

- No deletion of existing low-confidence rows (the UI filter hides them at 75%; user can purge later if desired).
- No changes to enrichment prompts or Apollo logic.
- No schema migrations.
