# Philips dashboard improvement plan

## Current state

The Philips Medical Sales dashboard operates in zero-login single-user mode across all views (`/`, `/pipeline`, `/accounts/:id`, `/settings/keywords`) and server functions, including lead actions, notes, Apollo enrichment/prospecting, Copilot, AI account research and outreach drafting, page extraction, manual intelligence refresh, CRM updates (`pushLeadToCrm`), and Gmail outreach (`sendOutreachEmail`). Legacy `/auth` URLs redirect directly to `/`.

Apollo requests require a successful durable quota reservation (`tryConsumeApolloCall`); database errors fail closed and block unmetered spending. Scheduled `/api/public/*` endpoints remain gated by `CRON_SECRET`, and user-supplied URLs pass through `assertSafePublicUrl` and `readCapped`.

## Next improvements, in order

| Priority | Improvement                                                                                                                                                           | Completion evidence                                                                                     |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1        | Rotate the service-role credential committed in public Git history and move server secrets into deployment configuration. Owner deferred rotation during this change. | Old credential rejected; deployment works using replacement; no secret values tracked in current files. |
| 2        | Confirm scheduled refresh health and source credentials using current ingestion logs. Historical audit reports are not evidence of current health.                    | Per-source last success, freshness, failures, and actual job cadence reconcile with the UI.             |
| 3        | Queue ingestion/enrichment in bounded, resumable jobs; retain the atomic daily Apollo cap and add per-request rate limits.                                            | Jobs resume after interruption; no repeated records or unmetered paid calls.                            |
| 4        | Make contact and contract-expiry signals explainable: source links, verified dates, confidence rationale, explicit unknown values.                                    | Reps can verify a suggested opportunity before outreach; no inferred expiry shown as fact.              |
| 5        | Reduce rep clicks with next-action views, follow-up dates, and notes that are not overwritten by background refetches.                                                | A rep can open a lead, log contact, save a note, and find the next follow-up after reload.              |
