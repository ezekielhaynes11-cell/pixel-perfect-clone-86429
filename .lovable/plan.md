# Fix Copilot "emails for Texas leads" error

## Root cause

Two problems stack:

1. **No tool returns emails grounded in leads.** `query_physicians` selects `npi, full_name, credentials, primary_specialty, practice_city, practice_state, practice_phone` — no `email`, `title`, `linkedin_url`. There's also no way to filter physicians to those linked to leads in a state.
2. **Apollo became the fallback.** The system prompt and tool catalog leave Apollo (`apollo_bulk_enrich`, `apollo_prospect`) as the only path to "get emails", so the model called Apollo. Apollo's response failed (rate limit / 4xx / endpoint), and the raw error was surfaced as the Copilot reply.

We already have emails in `physician_contacts` for previously enriched contacts — the Copilot just can't see them.

## Changes

### 1. Extend `query_physicians` (`src/lib/copilot-tools.server.ts`)

- Add args: `lead_state` (TX/OK/AR/LA — find physicians linked to any lead whose territory matches), `has_email` (boolean), `name_contains`.
- Expand `select` to include `email, title, linkedin_url, apollo_enriched_at`.
- When `lead_state` is set: query `leads` for that state (reuse same territory ILIKE/code logic as `query_leads`), then `lead_physicians` for those `lead_id`s, then filter `physician_contacts` to the resulting NPI set. Return each contact with the linked `lead_id` / `lead_title` for citations.
- When `has_email: true`, filter `email IS NOT NULL`.

### 2. Update Copilot system prompt (`src/lib/copilot.functions.ts`)

Add one rule before the Apollo rule:

> To find existing contact info (email, title, LinkedIn) for leads, ALWAYS call `query_physicians` with `lead_state` and `has_email: true` first. Only suggest `apollo_bulk_enrich` if the user explicitly asks to enrich missing contacts.

### 3. Better Apollo error surfacing (`src/lib/apollo/client.server.ts`)

- Log full status + first 500 chars of body to server logs on non-OK responses.
- Already-thrown messages for 401/402/429 are good; for other 4xx/5xx include the Apollo `message` field if JSON.

### 4. Out of scope

- No DB migrations.
- No bulk Apollo run from this fix.
- No UI changes.

## Verification

1. Open Copilot → "Show me emails for Texas leads".
   - Expect: model calls `query_physicians({ lead_state: "TX", has_email: true })`, returns a markdown list of `Name — email — title (Lead)`.
2. Ask "enrich any missing emails for Texas leads".
   - Expect: model confirms then calls `apollo_bulk_enrich`.
3. If Apollo still errors, check `stack_modern--server-function-logs` — the new log line shows status/body so we can iterate.

## Files touched

- `src/lib/copilot-tools.server.ts`
- `src/lib/copilot.functions.ts`
- `src/lib/apollo/client.server.ts`
