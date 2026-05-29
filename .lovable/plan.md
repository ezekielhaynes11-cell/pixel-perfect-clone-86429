## Why only 6 leads show

The dashboard query (`listLeads` in `src/lib/leads.functions.ts`) pulls the **top 200** enriched leads ordered by confidence, then filters out dismissed ones on the client. You currently have **550 enriched leads** and **200 dismissals in `lead_actions`** — and 194 of those dismissals fall inside the top-200 window. That leaves 6 visible cards.

So this isn't a bug in rendering or filtering — it's the dismiss filter biting a fixed-size server page.

## Fix

Exclude dismissed leads at the database layer and raise the cap, so the visible feed stays full regardless of how many you dismiss.

1. **`src/lib/leads.functions.ts` — `listLeads`**
   - Take an optional `ownerId` (default `OWNER_ID`) and first fetch dismissed `lead_id`s for that user from `lead_actions`.
   - Add `.not("id", "in", "(...)")` on the leads query to exclude them server-side. Keep the confidence/date ordering.
   - Raise `.limit(200)` to `.limit(500)` so the feed has real headroom even after future dismissals.
   - Keep returning the same shape so `rowToLead` / UI don't change.

2. **`src/routes/index.tsx`**
   - Keep the existing client-side `dismissedIds` logic for the "Show dismissed" toggle (so the dismissed view still works), but it becomes a no-op on the active list since the server already excluded them.
   - Optionally fetch dismissed leads via a separate `listDismissedLeads` server fn if we want the dismissed view to also show beyond 500; not required for this fix.

3. **Verification**
   - Reload `/` → active feed shows hundreds of cards (capped at 500), not 6.
   - Click "Show dismissed" → still shows the 200 dismissed leads.
   - Dismiss a new lead → it disappears from active after refetch; appears under dismissed.

## Out of scope

- No schema changes, no migrations.
- No changes to ingestion, Apollo enrichment, or the Contact section.
- Not introducing real pagination — 500 is enough headroom for now.