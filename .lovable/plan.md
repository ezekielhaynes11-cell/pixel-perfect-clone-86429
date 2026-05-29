# Plan: Fix Copilot search + add Apollo integration

## Part 1 — Fix "no results" in Copilot

Two root causes in `src/lib/copilot-tools.server.ts → query_leads`:

1. **Hardcoded `.eq("enriched", true)`** drops 144 / 446 leads.
2. **State filter is exact-match** on a dirty `territory` column (37 rows say `texas`, but other rows are `Texas`, `(Multiple states)`, `null`, etc., so `state: "TX"` misses most of them).

Plus the system prompt tells the model "always call a tool before answering" but never tells it to broaden a query when the first call returns 0. So one empty result → "no results."

### Changes
- `query_leads`: drop the hard `enriched=true` filter; add an optional `enriched_only` arg (default `false`). Replace `eq("territory", …)` with `ilike("territory", "%texas%")` style matching, plus a state-code → state-name map for TX/OK/AR/LA → matches `texas`, `oklahoma`, etc. case-insensitively. Also widen `hospital`/`title`/`summary` search via a new optional `text_search` arg using `or(...)` with `ilike` across title/summary/hospital.
- System prompt in `src/lib/copilot.functions.ts`: add a rule — "If a tool returns 0 results, try ONE broader call (drop the narrowest filter) before saying nothing matched."
- Bump per-tool result cap from 50 → 100 and keep the 16 KB serialized-tool-output truncation, but switch to a structured slim shape (drop `raw_payload`-style fields we already exclude) so 100 rows fit.

### Why not stream
Copilot already returns the final text in one yield (no SSE from gateway). Not the cause of "no results"; leaving as-is.

## Part 2 — Apollo integration

Apollo provides an `X-Api-Key` REST API at `https://api.apollo.io/api/v1`. We'll use:
- `POST /mixed_people/search` — find people by title/location/keyword
- `POST /people/match` — enrich one person by name + org (returns email/phone/title/LinkedIn)
- `POST /mixed_companies/search` — find/enrich orgs by name/domain/location

### New secret
- `APOLLO_API_KEY` (requested via `add_secret` tool once plan is approved).

### New schema
Add columns to `physician_contacts`:
- `email text`, `linkedin_url text`, `title text`, `apollo_id text`, `apollo_enriched_at timestamptz`

Add columns to `accounts`:
- `domain text`, `apollo_org_id text`, `employee_count int`, `apollo_enriched_at timestamptz`

(GRANTs + existing RLS stay; both tables are already readable by authenticated.)

### New server module: `src/lib/apollo/client.server.ts`
Thin wrapper with three functions: `apolloPeopleSearch`, `apolloPersonMatch`, `apolloOrgSearch`. Handles `APOLLO_API_KEY`, rate-limit / 402 surfacing, and a 30 s timeout.

### New server functions (`src/lib/apollo.functions.ts`)
All under `requireSupabaseAuth`:
1. `enrichPhysicianContact({ npi })` — calls `people/match` using existing name + state, writes back email/phone/title/linkedin/apollo_id.
2. `enrichAccount({ accountId })` — calls `mixed_companies/search` by name+state, writes domain/employee_count/apollo_org_id.
3. `prospectContacts({ accountId?, state, titles[], keywords[], limit })` — calls `mixed_people/search`, upserts results into `physician_contacts` (using `apollo_id` as the key when no NPI), and optionally links them to an account.

### Wire into existing UI (small touches)
- `AccountBrief.tsx`: add "Enrich with Apollo" button → calls `enrichAccount`, then triggers existing brief refresh.
- `LeadDetailModal.tsx`: each linked physician gets an "Enrich" link → calls `enrichPhysicianContact`.
- New "Prospect" button on `accounts/$id` page → opens a small dialog (titles, keyword, limit) and calls `prospectContacts`.

### Power Copilot search — add 3 tools to `COPILOT_TOOLS`
- `apollo_prospect` → wraps `prospectContacts` (persists results).
- `apollo_enrich_account` → wraps `enrichAccount`.
- `apollo_enrich_physician` → wraps `enrichPhysicianContact`.

Update Copilot system prompt: "You can prospect new contacts and enrich physicians/accounts via Apollo. Confirm before prospecting more than 25 contacts in one call."

## Files touched

- `src/lib/copilot-tools.server.ts` — query_leads fix + 3 Apollo tool entries
- `src/lib/copilot.functions.ts` — prompt update
- `src/lib/apollo/client.server.ts` — new
- `src/lib/apollo.functions.ts` — new
- `src/components/dashboard/AccountBrief.tsx` — Enrich button
- `src/components/dashboard/LeadDetailModal.tsx` — per-physician Enrich
- `src/routes/accounts.$id.tsx` — Prospect dialog
- Migration: add columns to `physician_contacts` and `accounts`

## Out of scope (ask before adding)

- Backfill job that bulk-enriches every existing account/physician.
- Apollo email-sequence sending.
- Storing Apollo's raw payloads long-term.

