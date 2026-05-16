# Finish the top-1% UI layer

The backend (9 tables, ingestion adapters for SAM.gov / openFDA / GDELT, Gemini enrichment, `listLeads` / `triggerIngestion` / `setLeadAction` server functions, auth) is live. This plan completes the three remaining UI surfaces a Philips rep needs to actually convert these signals into pipeline.

## 1. Outreach Draft modal (per-lead AI email)

- Add `draftOutreach` server fn in `src/lib/outreach.functions.ts` wrapping the existing `outreach.server.ts` helper. Returns `{ subject, body, id }` and persists to `outreach_drafts`.
- Add `listDraftsForLead(leadId)` server fn so reopening a lead shows prior drafts.
- New component `OutreachDraftDialog.tsx`:
  - Tone selector (Discovery / Follow-up / Executive intro)
  - "Generate with AI" button → calls `draftOutreach` via `useMutation`
  - Editable subject + body textareas, "Copy" and "Open in mail client" (`mailto:`) actions
  - Saves edits back via an `updateDraft` server fn
- Wire from `LeadCard` "Draft outreach" action and from `LeadDetailModal`.

## 2. Pipeline forecast view

- New route `src/routes/pipeline.tsx` under the same auth gate.
- New server fn `getPipelineForecast` that reads `leads` and returns:
  - Total weighted pipeline = Σ `estimated_value_usd × win_probability` (filter: not dismissed, confidence ≥ 60)
  - Breakdown by `hospital`, by `specialty`, by week of `date_discovered`
  - Top 10 leads by weighted value
- UI: 3 summary cards (Total weighted, Open leads, Avg confidence), a stacked bar chart by specialty (Recharts), and a sortable table of top weighted leads with quick "Draft outreach" + "Open in Salesforce" actions.
- Add a "Pipeline" link to the sidebar nav.

## 3. Saved Searches + Alerts

- `SavedSearchesDrawer.tsx` opened from header:
  - List current saved searches with name, filter chips, alert threshold, on/off toggle
  - "Save current view" button captures the dashboard's active `FilterBar` state into `saved_searches.filter` (jsonb)
  - Edit / delete per row
- Server fns: `listSavedSearches`, `upsertSavedSearch`, `deleteSavedSearch`, `toggleSavedSearchAlerts`.
- Alerts evaluation: extend `run.server.ts` so that after ingestion+enrichment, for each saved search with `alerts_enabled`, insert rows into `alerts` for newly-enriched leads matching the filter with `confidence >= alert_threshold`.
- Bell icon in `Header.tsx` with unread count (`alerts` where `read_at is null`), dropdown lists recent alerts, click marks read and opens the lead.

## 4. Polish that ships with this turn

- `Refresh feed` button shows last `ingestion_runs` timestamp + per-source counts in a tooltip.
- `LeadDetailModal` gets an "AI briefing" tab that calls a `getOrCreateDailyBriefing` server fn (Gemini 2.5 Flash) summarizing today's top 5 leads for the rep, persisted to `briefings`.
- Fix the current SSR error (preview shows "SSR rendering failed") before adding new routes — likely a server-only import reachable from a route file; will diagnose with `server-function-logs` and the import graph and correct in the first step.

## Technical notes

- All new server fns use `createServerFn` + `requireSupabaseAuth`; no Edge Functions.
- Outreach generation, briefings, and any enrichment continue to go through Lovable AI Gateway (`google/gemini-2.5-flash`); no new secrets required.
- New tables: none — schema already has `outreach_drafts`, `saved_searches`, `alerts`, `briefings`.
- No scheduled jobs: alerts are evaluated at the end of each on-demand ingestion run.
- Out of scope (deferred): email delivery of alerts (would need `RESEND_API_KEY`), real Salesforce OAuth, LinkedIn/hiring sources.

## Build order

1. Diagnose & fix the SSR error so preview is healthy
2. Outreach Draft modal (highest rep value)
3. Saved Searches + in-app alerts bell
4. Pipeline forecast route
5. Daily AI briefing tab + Refresh tooltip

Shall I proceed?
