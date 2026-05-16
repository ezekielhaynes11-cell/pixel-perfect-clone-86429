## Pre-handoff sprint (no email/Resend work)

Goal: get the dashboard to a state Mike can use day-one without manual triggering.

### 1. Seed `keyword_lists` from the PRD

Insert the full vendor/product/role taxonomy so Reddit/Bluesky/GDELT adapters have something to match against. Three `kind` values:

- `vendor` — GE Healthcare, Mindray, SonoSite (Fujifilm), Samsung, Canon, Siemens, Konica Minolta, Esaote, Butterfly, Clarius, EchoNous, Kosmos, Exo
- `product` — Venue Fit, Venue Go, Vivid iq, Voluson, Logiq, M9, ME8, TE7, X-Porte, Edge II, PX, HS50, HS60, Aplio i-series, Acuson Juniper, P20, IQ
- `role` — POCUS Director, Fellowship Director, Emergency Ultrasound Director, Chief of EM, Critical Care Director, Biomed Director, Imaging Director, Chief Radiologist

Done via `supabase--insert` (data, not schema).

### 2. FilterBar chips for the new metadata

Add to `src/components/dashboard/FilterBar.tsx`:
- **Signal type** multi-select: recall, RFP, funding, M&A, expansion, sentiment, incumbency
- **Account type** toggle: VA / Non-VA / All
- **Vendor** multi-select sourced from `keyword_lists` where kind='vendor'
- **State** chips: TX / OK / AR / LA (Mike's territory)

Wire into `useLeads` filter object and `leads.functions.ts` query builder.

### 3. `/accounts/$id` deep-dive page

New route `src/routes/accounts.$id.tsx` showing:
- Header: account name, state, VA badge, system
- Vendor footprint card (aggregated `vendor_mentions` across that account's leads)
- Timeline of signals (leads grouped by `signal_type`, newest first)
- Linked physicians (from `lead_physicians` joined through `leads.account_id`)
- Scraped pages list (from `scraped_pages` where `account_id` matches)

LeadCard gets a "View account" link when `account_id` is set.

### 4. End-to-end ingestion test

- Trigger `/api/public/ingest` once manually via `stack_modern--invoke-server-function`
- Read `ingestion_runs` + sample 10 enriched leads
- Spot-check that signal_type, vendor_mentions, account_type are populated
- Fix any adapter producing junk before scheduling

### 5. Schedule ingestion via pg_cron

Enable `pg_cron` + `pg_net`, then schedule `/api/public/ingest` every 4 hours using the documented `apikey: <anon>` pattern. SQL goes through `supabase--insert` (not migration) since URL + anon key are environment-specific.

### 6. Provision Mike's admin account

Two-step:
- Ask user for Mike's email (one ask_questions call)
- Once we have it, insert a row into `user_roles` with role='admin' after he signs up — OR if he hasn't signed up yet, document the one-line SQL Mike can run after his first login. Cleanest: have Mike sign up first, then I flip his role.

### Technical notes

- All data writes (taxonomy seed, cron schedule, role grant) go through `supabase--insert`, not migrations.
- No new tables, no new columns — schema is already in place from the last migration.
- FilterBar and accounts page are pure frontend + server-fn query extensions; no new dependencies.
- Ingest cron URL: `https://project--4153fd65-1b3f-4a50-9892-2fe6d3062712.lovable.app/api/public/ingest`

### Out of scope (explicitly deferred)

- Morning email digest (needs Resend domain)
- Apollo / LinkedIn / X / Facebook
- Saved-search alert email delivery (in-app alerts still work)

### Order of execution

1 → 2 → 3 → 4 → 5 → 6. Steps 1–3 are independent code; 4 validates; 5 automates; 6 hands over.

Approve and I'll build straight through.