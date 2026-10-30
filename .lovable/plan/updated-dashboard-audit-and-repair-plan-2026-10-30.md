# Updated Dashboard Audit and Repair Plan

I checked each finding from the old review against the current code. Live database checks didn't run because the backend was unreachable during this pass. Step 0 re-checks the database parts.

## Already fixed (confirmed in code)

- C2: Scheduled sync endpoints now require a server-only `CRON_SECRET` and refuse requests when it isn't set.
- C3: The lead pop-up's Notes save, Mark Contacted and CRM push buttons now work.
- C4/H9: Dismissed leads are filtered in the browser, so Restore works and no long URLs are built.
- H1: The `enrich-contact` edge function is gone.
- H2/H3: Apollo use is counted in one place and stored in the database (`consume_apollo_call`). It allows calls if the database check fails, which is a cost risk.
- H5: Contact enrichment only runs when the rep clicks for it.
- H6: Saved-search state alerts convert between "TX" and "texas".
- H7: Bulk actions upsert with `ignoreDuplicates`.
- H8: The pipeline forecast uses the same ordering as the feed.
- H12: The email link fills in the recipient.
- H13: No more changing the copilot's message text in place.
- Fake 7-day trend and fake Header component are removed. `sendOutreachEmail` records `contacted`.

## Still broken (ranked)

1. **Security, critical: no sign-in and open server functions.** There is no login page. Every function except the Apollo ones uses the admin client, which skips row-level security, and has no auth check. The rep/admin row-level rules added recently therefore protect nothing. Anyone with the URL can read lead and physician PII, change data, spend AI credits, push to CRM, and send Gmail as the owner (`sendOutreachEmail`).
2. **Broken flow and cost: Apollo buttons can't succeed.** `apollo.functions.ts` (5 functions) requires a signed-in user, and no one can sign in. Enrich, Prospect and Bulk enrich always fail. The old "Bulk enrich ≤100 calls" can also run past the 60-second server time limit.
3. **Security: page scraping can be pointed at internal addresses (SSRF).** `scrape-url.server.ts` fetches any URL with no http(s) or host check, no private-IP block, no timeout and no size limit, and anyone can call it.
4. **Mobile: navigation is limited.** The sync status is hidden on phones. Pipeline and Saved show up, but `/settings/keywords` still has no link anywhere.
5. **Reliability: no timeouts.** No outside call (AI gateway, Apollo, SAM.gov, scraper) uses `AbortSignal.timeout`, so a stuck service can tie up a server worker.
6. **Data accuracy: leftover duplicate-detection string checks.** `run.server.ts:296`, `nppes.server.ts:205` and `admin.functions.ts:47` still look for the word "duplicate" in error text instead of using `isUniqueViolation`.
7. **Security, medium: copilot filter injection.** Search text chosen by the AI model goes into `.or()` filters (`copilot-tools.server.ts:319,342`) without removing `,()`.
8. **Trust: missing error states.** Only the ingest action and the account page handle errors. When the feed or pipeline query fails, users see the "No leads" empty state instead.
9. **Ops: SAM.gov key returns 401**, and the scheduled sync jobs haven't succeeded in weeks (from the last session).
10. **Quality: no tests at all**, and there is no `test` script.

## Top 5 safe fixes to do first

1. **Add one sign-in model.** Add a sign-in page (email plus Google), put the dashboard behind a protected layout, and run every server function through `requireSupabaseAuth`. Replace `OWNER_ID` with the signed-in user's ID, and use `context.supabase` so the existing rep/admin row-level rules actually apply. Keep the admin client only in the scheduled sync and ingestion code. This also fixes #2.
2. **Make the scraper safe.** Allow only http and https, refuse private, loopback and link-local addresses and redirects, add a 15-second timeout, and cap pages at 2 MB.
3. **Add a shared `fetchWithTimeout` helper** (30 seconds, one retry on 429 or 5xx) and use it for the AI gateway, Apollo, the ingestion sources and Gmail/HubSpot.
4. **Lower Apollo cost risk.** Stop allowing calls when the usage check fails during bulk paths (allowing them on single clicks is still OK). Process bulk enrich in groups of 20 or fewer, with a "continue" step.
5. **Fix rep-facing trust gaps.** Add error and retry states to the feed and pipeline. Add a mobile menu with Settings and sync status. Switch the three duplicate checks to `isUniqueViolation`, and clean up the copilot search text.

## Technical details

- Step 0 (before coding): run queries on `pg_policies`, `user_roles` rows, `apollo_usage`, `refresh_state`, the `cron.job` run history, and check `CRON_SECRET` is set on the cron side. If no user has the `rep` or `admin` role, the first login will see an empty feed: seed the owner's role in a migration.
- Auth wiring: `src/start.ts` already registers `attachSupabaseAuth`. Add `src/routes/auth.tsx` and `src/routes/_authenticated.tsx`, and move `index`, `pipeline`, `accounts.$id` and `settings.keywords` under it.
- Integration risks: after the auth change, the scheduled sync must keep working through `CRON_SECRET` and the admin client. Existing `lead_actions` and notes are stored under `OWNER_ID`, so map the owner account to that ID or migrate the rows. Gmail sending stays owner-only.
- Data risks: tighter row-level rules could hide leads from users without a role, so check the role seeding first.

## Checks after implementation

- Build log is clean and `tsgo` typecheck passes.
- Add vitest with tests for: cron auth refuses requests when no secret is set or the secret is wrong; the scraper refuses `http://127.0.0.1`, `169.254.169.254` and `file://`; the Apollo usage check stops calls at the cap; the "TX"↔"texas" conversion; `isUniqueViolation`.
- Playwright: signed-out visitors are sent to /auth; after signing in, the feed loads, Mark Contacted and Notes still show after reload, Apollo Enrich succeeds once, the mobile (390px) menu reaches Settings, and a forced feed error shows Retry.
- curl: a server function call without a token returns 401, and `/api/public/ingest` without the secret returns 401.
- Run the security scan again after the auth change.
