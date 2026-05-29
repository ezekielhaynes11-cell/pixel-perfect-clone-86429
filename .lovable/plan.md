# Fix slow / "not loading" lead feed

## Diagnosis

- DB has 446 leads (302 enriched). Data is intact.
- `listLeads` in `src/lib/leads.functions.ts` returns `select("*")` including the `raw_payload` jsonb column. Each row is tens of KB; the full response for 200 rows is several MB and takes ~3.5s over the network.
- Result: the dashboard renders "Loading leads… (0)" with all-zero summary cards for several seconds on first paint. To the user this looks broken.
- `getRecentIngestionRuns`, `listLeadActions`, `listLeadPhysicians` all complete in ~1.2s; only `listLeads` is the bottleneck.

## Changes

1. **`src/lib/leads.functions.ts → listLeads`**
   - Replace `.select("*")` with an explicit column list that excludes `raw_payload` and `entities` raw blobs we don't need on the dashboard. Keep: `id, source, source_external_id, source_url, title, summary, confidence, priority, hospital, specialty, territory, entities, estimated_value_usd, win_probability, competitor_incumbent, date_discovered, date_ingested, enriched, vendor_mentions, account_type, signal_type, account_id`.
   - Lead detail modal already re-fetches per-lead when needed (or can — verify); if it currently relies on `raw_payload` from the list, add a small `getLeadById` server fn that returns full row including `raw_payload`, and have the modal call it on open.

2. **`src/routes/index.tsx` loading UX**
   - Replace the flat "Loading leads…" string with a skeleton list (3-5 placeholder cards) so users see structure immediately.
   - Show a small "Syncing first batch…" banner only when `runsQ.data?.length === 0` AND `leadsQ.data?.length === 0` AND `ingest.isPending` — not when leads are simply still fetching.

3. **`rowToLead` mapper**
   - Adjust the typing so `raw_payload` is optional; only LeadDetailModal pulls it via the new per-lead fetch.

## Out of scope

- Pagination / virtualization of the lead feed (separate follow-up).
- Compressing `raw_payload` storage.

## Verification

- Reload `/` in preview, confirm dashboard cards populate within ~1s and feed shows skeletons → real cards.
- Open a lead, confirm detail modal still has full source/raw data.
- `network` tab: `listLeads` response shrinks from MBs to <200 KB.