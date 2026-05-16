
# Yield Architect → Production-Grade Sales Intelligence

Replace the mock `src/data/leads.ts` array with a real ingestion pipeline backed by Lovable Cloud, Gemini 2.5 Flash enrichment, and a set of features designed to drive multi-million-dollar pipeline for Phillips Medical reps.

## 1. Backend (Lovable Cloud)

Enable Cloud and create the following tables (all with RLS):

- `leads` — id, title, summary, source, source_url, source_external_id (dedupe key), raw_payload (jsonb), confidence, hospital, specialty, territory, entities (jsonb), priority, estimated_value_usd, win_probability, date_discovered, date_ingested, status (`new|saved|dismissed|in_sfdc`), assigned_rep_id
- `lead_actions` — per-rep saved/dismissed/notes/SFDC-push log (so saves are per-user, lead row stays shared)
- `saved_searches` — user_id, name, filter JSON, alert_threshold (e.g. 90), notify_email
- `alerts` — user_id, lead_id, saved_search_id, sent_at, channel
- `briefings` — user_id, date, markdown summary, top_lead_ids
- `outreach_drafts` — lead_id, user_id, subject, body, created_at
- `profiles` + `user_roles` (admin/rep) — standard secure pattern
- `ingestion_runs` — source, started_at, finished_at, fetched_count, new_count, error

## 2. Ingestion (server functions, on-demand)

A single `runIngestion` server function fans out to:

- **SAM.gov Opportunities API** — keyword filter for ultrasound, MRI, CT, ventilator, ECMO, infusion pump, patient monitor, cath lab; NAICS 339112/621. Requires `SAM_GOV_API_KEY` (free).
- **openFDA `/device/enforcement.json`** — competitor recalls (filter to recalling firms != Philips). No key needed.
- **GDELT 2.1 DOC API** — hospital capital projects, fellowships, expansions. No key.
- **Reddit OAuth** — `r/medicine`, `r/nursing`, `r/Residency` search for vendor/equipment mentions. Requires `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`.

Each source normalizes to a common `RawLead` shape, dedupes against `source_external_id`, then queues for enrichment.

## 3. Enrichment (Gemini 2.5 Flash via Lovable AI Gateway)

One `enrichLead` server fn per raw lead. Single structured-JSON call that returns:

- `summary` (≤280 chars, sales-rep voice)
- `confidence` 0–100 (with rubric in system prompt: explicit RFQ=95+, recall replacement=90+, public budget=85+, hiring/news=70±, reddit chatter=60±)
- `priority` high|medium|low
- `hospital`, `specialty`, `territory` (CA/Pacific/etc.)
- `entities` { hospitals[], physicians[], equipment[], keywords[] }
- `estimated_value_usd` and `win_probability` (0–1) — drives pipeline view
- `competitor_incumbent` (when inferable)

Model: `google/gemini-2.5-flash`. Cost-bounded by only enriching new (deduped) rows.

## 4. Frontend changes

Replace `src/data/leads.ts` with `useLeads()` (TanStack Query + `createServerFn`) reading from `leads` table.

New / changed UI:

- **Refresh now** button in header → calls `runIngestion`, shows per-source progress toast, invalidates query.
- **Lead card actions** wired to real handlers: Save / Dismiss / Add to Salesforce (stub link with deep-link template) / **Draft outreach email** (opens modal, calls `draftOutreach` server fn).
- **Saved searches drawer** — save current filter, set confidence threshold, toggle email alerts.
- **Daily AI Briefing** panel at top of dashboard (collapsible) — markdown rendered, regenerated on first load each day.
- **Pipeline tab** (`/pipeline`) — table + bar chart of Σ `estimated_value_usd × win_probability` by hospital, specialty, week. KPI cards: Total pipeline $, Weighted pipeline $, Leads × stage.
- **Auth** — email + Google sign-in, per-rep workspace; gated routes under `_authenticated`.
- Sidebar trend chart switches from hardcoded numbers to real 7-day rolling counts from `leads`.

## 5. Alerts

`checkAlerts` server fn (called at end of every ingestion run) compares new leads to each `saved_search.filter` + threshold, inserts into `alerts`, and emails the rep via Resend (requires `RESEND_API_KEY`). Slack deferred.

## 6. Secrets to request

`SAM_GOV_API_KEY`, `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `RESEND_API_KEY`. `LOVABLE_API_KEY` is auto-provisioned.

## 7. Out of scope (now)

- LinkedIn / hiring signals (user opted out)
- Scheduled cron (user chose on-demand)
- Real Salesforce OAuth push (we ship a deep-link + CSV export; full OAuth is a follow-up)

## Technical notes

- All ingestion + enrichment runs in `createServerFn` handlers (TanStack Start), never client-side.
- Source clients live in `src/lib/ingest/*.server.ts`; thin `*.functions.ts` wrappers expose them.
- AI calls use the gateway pattern (`https://ai.gateway.lovable.dev/v1/chat/completions`, `Bearer ${LOVABLE_API_KEY}`), structured outputs via JSON schema tool call.
- Per-user data (`saved_searches`, `lead_actions`, `briefings`, `outreach_drafts`) keyed by `auth.uid()` with RLS `USING (user_id = auth.uid())`.
- Roles stored in separate `user_roles` table with `has_role()` SECURITY DEFINER fn (no recursion).
- Dedupe: `UNIQUE (source, source_external_id)`. Re-ingestion is idempotent.
- Mock `leads.ts` kept temporarily as a seed used only when the DB is empty, then deleted.

## Build order

1. Enable Cloud, request secrets, create schema + RLS + auth pages.
2. Build ingestion adapters (one PR each: SAM → openFDA → GDELT → Reddit) with a unit-style server-fn test.
3. Enrichment fn + structured schema.
4. Wire `useLeads` + Refresh button; remove mock data.
5. Saved searches + alerts + email.
6. Daily briefing + draft outreach.
7. Pipeline view.
