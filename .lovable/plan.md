# Pre-beta polish: surface Apollo enrichment in physician rows

Scope is intentionally narrow per the user's "skip auth, just polish UI" decision. Auth wiring is a separate follow-up; today's session already has a Supabase session in localStorage, so server fns continue to work for the beta tester.

## Problem

`physiciansForAccount` (`src/lib/accounts.functions.ts:141`) only selects `npi, full_name, credentials, primary_specialty, practice_city, practice_state, practice_phone`. Apollo writes `email`, `title`, `linkedin_url`, and `apollo_enriched_at` to `physician_contacts`, but the UI never fetches or renders them — so the "Enrich" button visibly does nothing after the toast clears. Reps will think the integration is broken.

## Changes

### 1. `src/lib/accounts.functions.ts` — return enriched fields
- Extend the `physician_contacts!inner(...)` projection to add: `email, title, linkedin_url, apollo_enriched_at`.
- Extend the mapped row type and the returned object with those four fields (all nullable strings except `apollo_enriched_at: string | null`).

### 2. `src/routes/accounts.$id.tsx` — inline render + "Enriched" badge
In the physician `<li>` (lines 257-297):
- After the existing `practice_phone` link, render (when present):
  - `p.title` — small muted text.
  - `p.email` — `<a href="mailto:{email}">` with `Mail` icon, same primary-link styling as phone.
  - `p.linkedin_url` — small icon link (`<Linkedin />` from lucide) opening in a new tab.
- Between the contact links and the "Enrich" button, when `p.apollo_enriched_at` is set, render a subtle badge:
  - Style: `rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary/80`.
  - Text: `Apollo · {timeAgo(apollo_enriched_at)}` (reuse existing `timeAgo` helper from `@/data/leads`).
- Update the `enrichMut` success handler to keep the toast it already shows; the query invalidation on line 43 already triggers a refetch so the badge + fields appear automatically.

### 3. Import housekeeping
- Add `Linkedin` to the lucide-react import at the top of `accounts.$id.tsx`.

## Out of scope (explicitly)

- Auth surface (login/signup/_authenticated layout) — flagged as a separate plan; the beta runs on the existing session in the tester's browser.
- Apollo error UX, account brief skeletons, password reset, etc.
- The `physician_contacts.apollo_id` column or any new DB writes — Apollo already populates everything we need.

## Verification

1. Open `/accounts/{id}` for an account whose physicians have NOT been enriched. Confirm rows render exactly as today (no badge, no email/linkedin slot taking space).
2. Click "Enrich" on one physician. Toast shows match. Within ~1s the row updates in place to show `title · email · LinkedIn icon` and the `Apollo · just now` badge.
3. Reload the page. Enriched physicians still show all four pieces; the badge time updates to e.g. `2m ago`.
4. Query `physician_contacts` (`select npi, email, title, linkedin_url, apollo_enriched_at from physician_contacts where apollo_id is not null limit 5`) and confirm the displayed values match the DB.

## Follow-up (NOT in this plan)

Auth surface — needs its own plan covering: `/login`, `/signup`, `_authenticated` layout wrapping `/`, `/pipeline`, `/accounts/$id`, `/settings/*`; router context with `auth.isAuthenticated`; sign-out in header; root `onAuthStateChange` for cache invalidation. Decide email/password vs. email+Google when you're ready.
