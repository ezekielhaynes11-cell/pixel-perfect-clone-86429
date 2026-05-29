# Surface contact info on lead cards + close the upstream gaps

User picked all three root causes. They're separable so I'll split into three numbered changes; each is verifiable on its own.

## What the data shows

- 512 leads total, 388 enriched, **only 3 have any linked physician**.
- Of 388 enriched leads, **363 have zero physician names** extracted (Gemini didn't find any). 25 do, but most are Reddit usernames (`__-sirene__`, `MDinthemaking123`) — junk for NPPES — and the ClinicalTrials ones have no state, so `attachPhysiciansToLead` falls into the ambiguous-match guard and returns null.
- 0 of 3 physician contacts have ever been Apollo-enriched.

So three independent things need to happen.

## Change 1 — Dashboard UI gap (mirror the /accounts fix)

`src/lib/leads.functions.ts → listLeadPhysicians` and `src/components/dashboard/LeadCard.tsx`.

- Extend the `physician_contacts!inner(...)` projection (line 462) to add `email, title, linkedin_url, apollo_enriched_at`.
- Add the same four fields to the `LeadPhysician` row type at the top of the file and to the mapped return rows.
- In `LeadCard.tsx` lines 153-177 (the expanded physician `<li>`), after the phone link render: `p.title` (muted), `mailto:` link with `Mail` icon, `Linkedin` icon link, and an `Apollo · {timeAgo(p.apollo_enriched_at)}` badge styled identically to the one in `accounts.$id.tsx` (`rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary/80`).
- Add `Linkedin` to the lucide import in `LeadCard.tsx`.

Verifiable: after this change but before #2/#3, only the existing 3 enriched-but-empty rows will show "no email" since Apollo hasn't run. That's expected — proves the UI works.

## Change 2 — Filter junk physician names + relax NPPES lookup

`src/lib/ingest/run.server.ts` lines 246-270 and `src/lib/ingest/nppes.server.ts` lines 128-131.

- **Pre-filter in run.server.ts:** before pushing a Reddit-source `phys.name` into `refs`, skip names that look like usernames: contain underscores, no whitespace + >2 digits, length < 4, or starts with `u/`. Reddit is the worst offender — 509 of the no-physician leads are mostly Reddit/social. (For clarity: leads with zero names still won't get physicians — that's a Gemini-extraction problem we're not solving here.)
- **Drop the strict ambiguous-match guard in nppes.server.ts:** today `if (results.length > 1 && !state) return null` throws away every ClinicalTrials lead where the trial lacks a state code. Replace with: if multiple results and no state, take the first match but stamp `confidence = 0.4` so reps know it's weak. This will start producing `lead_physicians` rows for the 22 ClinicalTrials-style leads that have real names.

Verifiable: rerun ingest enrichment on the 25 leads that already have physician names (or just wait for the next cron); expect `lead_physicians` count to jump from 3 to ~15-25.

## Change 3 — Bulk Apollo-enrich endpoint + button

New server fn + small Settings tile. NOT a cron — we don't want to silently burn Apollo credits.

- New server fn `bulkEnrichApollo` in `src/lib/apollo.functions.ts`: takes optional `limit` (default 25, max 100), selects from `physician_contacts WHERE apollo_id IS NULL AND apollo_enriched_at IS NULL ORDER BY last_verified_at DESC`, runs `apolloEnrichPhysician` for each with a 300ms pacing delay, returns `{ attempted, matched, errors }`. Guard with `requireSupabaseAuth`.
- In `src/routes/settings.keywords.tsx` (existing Settings page) add a small "Bulk enrich physicians via Apollo" tile with a number input (default 25, max 100) and a button that calls the fn and toasts the result. Show the unenriched count beside it (cheap `COUNT(*)` server fn).
- Register the same operation as a Copilot tool `apollo_bulk_enrich` in `src/lib/copilot-tools.server.ts` so the assistant can offer it conversationally.

Verifiable: click the button with limit=10; toast shows `Attempted 10 · Matched N · 0 errors`; refresh /accounts/$id and the Apollo badge + emails appear on enriched physicians.

## Out of scope (explicitly, again)

- Improving Gemini's physician extraction on the 363 leads with zero names — needs prompt iteration, separate plan.
- Auth surface — still deferred.
- Backfilling Apollo as a cron — deliberately manual to control spend.

## Verification flow

1. Load `/` — confirm the 3 existing physician-linked cards now show whatever fields they have (just phone for now); no regression on cards with no physicians.
2. Re-trigger an ingest run from the dashboard; confirm `lead_physicians` count grows (SELECT `COUNT(DISTINCT lead_id) FROM lead_physicians`).
3. Go to Settings → click "Bulk enrich physicians (limit 25)". Wait for toast.
4. Query `physician_contacts WHERE apollo_enriched_at IS NOT NULL` — expect non-zero.
5. Reload `/` — the cards whose physicians got enriched now show email/title/LinkedIn + "Apollo · just now" badge.
