# Philips dashboard improvement plan

## Current change

Visitors can open the dashboard, pipeline, account details, and settings without a mandatory sign-in. Shared lead actions and Apollo enrichment/prospecting are public, as explicitly authorized by the owner. Apollo requests require a successful durable quota reservation; database errors block spending.

AI gateway operations, ingestion/refresh mutations, and Gmail/CRM integration actions retain server-side rep/admin checks. Optional operator sign-in is available from the More menu. Their controls are disabled for signed-out visitors rather than failing after a click.

## Next improvements, in order

| Priority | Improvement | Completion evidence |
| --- | --- | --- |
| 1 | Rotate the service-role credential committed in public Git history and move server secrets into deployment configuration. Owner deferred rotation during this change. | Old credential rejected; deployment works using replacement; no secret values tracked in current files. |
| 2 | Confirm scheduled refresh health and source credentials using current ingestion logs. Historical audit reports are not evidence of current health. | Per-source last success, freshness, failures, and actual job cadence reconcile with the UI. |
| 3 | Queue ingestion/enrichment in bounded, resumable jobs; retain the atomic daily Apollo cap and add per-request rate limits. | Jobs resume after interruption; no repeated records or unmetered paid calls. |
| 4 | Make contact and contract-expiry signals explainable: source links, verified dates, confidence rationale, explicit unknown values. | Reps can verify a suggested opportunity before outreach; no inferred expiry shown as fact. |
| 5 | Reduce rep clicks with next-action views, follow-up dates, and notes that are not overwritten by background refetches. | A rep can open a lead, log contact, save a note, and find the next follow-up after reload. |
| 6 | Decide whether AI Copilot and Gmail/CRM actions should ever be anonymous. Keep current role checks until specifically authorized. | Public access choice, spending controls, outbound limits, and expected recipients are defined before exposure. |

## Validation and limits

Three mocked checks of the actual Apollo quota function passed: only an explicit reservation permits spending, database errors/throws block spending, and the configured cap/default are passed to the database RPC. Changed non-JSX TypeScript files were parsed with Node's TypeScript transformer.

A complete application build and signed-in/out browser walkthrough still require the repository dependencies and deployment access. No production database writes, Apollo calls, Gmail sends, or CRM mutations were performed during these checks.
