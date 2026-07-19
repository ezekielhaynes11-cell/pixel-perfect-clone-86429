# Dashboard Review — "Yield Architect / Philips Sales Intelligence"

A four-lens audit of the entire dashboard, conducted by four independent reviewers:
frontend, backend, code quality, and end-user UX (from the perspective of a medical
device sales rep). This document consolidates their findings and the prioritized
suggestions that follow.

_Reviewed at commit on branch `claude/dashboard-sub-agent-review-m429cy`._

---

## TL;DR — the five things that matter most

1. **The app has no authentication.** ~90% of server functions run on a Supabase
   service-role client (RLS bypass) and are callable by anyone who has the URL —
   including `sendOutreachEmail`, which sends real email from the owner's Gmail, and
   Apollo enrichment, which spends paid credits. This is the single biggest risk.
2. **The "public" cron endpoints are guarded only by the public anon key**
   (`SUPABASE_PUBLISHABLE_KEY`), which ships in the browser bundle — so ingestion and
   Apollo prospecting are effectively open to trigger.
3. **The core rep workflow is dead UI.** "Mark Contacted", "Add to Salesforce",
   "Save", and "Share" in the lead modal have no handlers, and the Notes box persists
   nothing. The app looks like it tracks follow-up and doesn't — which destroys trust
   on first use.
4. **Paid Apollo credits leak silently.** Contact enrichment auto-fires on every lead
   modal open (despite "user-initiated only" comments), and the daily quota cap is
   bypassed on most call paths and stored in per-isolate memory that resets constantly
   on Cloudflare Workers.
5. **Fake data is presented as live.** The 7-Day Trend chart is a hardcoded array;
   a dead Header component shows "synced 2 minutes ago" and a fake user. On a
   data-trust product, one noticed fake number taints every real one.

Overall code-health grade from the code reviewer: **C-**. Typechecks clean under
`strict`, coherent layering, real care in spots — but a systemic authorization gap,
several silent correctness bugs, fake UI data, meaningful dead code, and a broken
lint gate (1,286 prettier errors) pull it down.

---

## What's real vs. what's fake

**Real (wired to Supabase via server functions):** lead feed, save/dismiss/bulk
actions, physicians, ingestion runs (SAM.gov, openFDA, GDELT, Reddit, Bluesky,
ClinicalTrials, CMS, RSS), enriched count, pipeline forecast, saved searches, alerts,
outreach draft generation/persistence, account detail/briefs, Apollo enrichment,
keywords/scraping settings. `src/data/leads.ts` is types + pure mappers now, not mock
data.

**Fake / dead / unwired:**
- `Sidebar.tsx` 7-Day Trend — hardcoded `[8,10,12,14,11,9,12]`.
- `LeadDetailModal.tsx` footer buttons + Notes textarea — no handlers, no persistence.
- `Header.tsx` — dead component, fake "synced 2 minutes ago" + fake user "Mike Klein".
- HubSpot push + Gmail send exist server-side but no UI reaches them.
- Client-side `supabase` browser client + `auth-attacher.ts` / `auth-middleware.ts` —
  present but dead; no login flow imports them.
- `enrich-contact` edge function — superseded by in-process `runContactWaterfall`.
- Briefings server module, `enrichLeadContact` (dupe), `triggerApolloBackfill`,
  `src/integrations/lovable/index.ts` — no callers.

---

## Findings by severity

### Critical

| ID | Area | Finding | Suggested fix |
|----|------|---------|---------------|
| C1 | Backend/Security | No auth on ~90% of server functions; all use `supabaseAdmin` (RLS bypass). Anyone with the URL can dump lead/physician PII, mutate data, burn Apollo + LLM spend, and **send Gmail as the owner** (`sendOutreachEmail`, `integrations.functions.ts:62`). | Apply `requireSupabaseAuth` via a single `authedServerFn` wrapper to every function, or gate the Worker behind Cloudflare Access. Auth plumbing already exists, unused. |
| C2 | Backend/Security | "Public" cron routes authenticate with the anon publishable key, which ships to every browser (`api/public/ingest.ts:32`, `apollo-sync-accounts.ts:32`). Effectively unauthenticated ingestion + uncapped Apollo prospecting. | Use a dedicated server-only `CRON_SECRET`. |
| C3 | Frontend/UX | Dead action buttons presented as real features: "Add to Salesforce", "Save", "Mark Contacted", "Share" have no onClick; Notes textarea never persists (`LeadDetailModal.tsx:78-110`). The core "who have I contacted?" workflow is fake. | Wire to `setLeadAction`/`pushLeadToCrm` (action enum already supports it) + persist notes, or remove. |
| C4 | Frontend | "Show dismissed" is structurally broken — dismissed leads are filtered server-side but recomputed client-side, so Restore is unreachable after any refetch/reload (`leads.functions.ts:22-39` vs `index.tsx:172-182`). | Return dismissal state (or an `includeDismissed` flag) and filter client-side; invalidate `["leads"]` with `["lead_actions"]`. |
| C5 | Code/Auth | The only auth-gated functions (Apollo) can **never** succeed — no login flow exists, so `requireSupabaseAuth` always throws. The Enrich/Prospect/Bulk-enrich buttons are dead on arrival. | Add a real sign-in flow, or drop the middleware and gate everything one consistent way. |

### High

| ID | Area | Finding | Fix |
|----|------|---------|-----|
| H1 | Backend/Reliability | `enrich-contact` edge function is unauthenticated, service-role, `verify_jwt=false`, CORS `*` — anyone with a lead UUID burns Apollo credits. Also dead code. | Delete it (superseded by `runContactWaterfall`). |
| H2 | Backend | Apollo daily cap not enforced on most paths — `apolloEnrichPhysician/Account`, `apolloProspectContacts`, waterfall fallback, and `apollo-sync-accounts` skip `tryConsumeApolloCall()`. | Move the quota check into `client.server.ts#call()` so every request is metered. |
| H3 | Backend | Quota counter is per-isolate in-memory on Workers — cap is effectively N×150/day and resets on redeploy (`quota.server.ts`). | Back it with an atomic `apollo_usage(day,count)` DB row. |
| H4 | Backend/Security | SSRF via `scrapePageForAccount` — accepts any URL, fetches server-side, persists + LLM-processes (`admin.functions.ts:59`). Anonymous (see C1). | Require auth + allowlist http(s) hosts, block private IPs, cap response size. |
| H5 | Code | Contact enrichment auto-fires on mount (`ContactSection.tsx:153-168`, `staleTime:0`) — re-runs on remount/refocus, burning Apollo credits silently. | `enabled:false` + `refetch()` from the CTA + a sane `staleTime`. |
| H6 | Code | Saved-search state alerts never fire — compares 2-letter code (`"TX"`) against slug (`"texas"`) (`run.server.ts:373-376`). Always false. | Reuse the existing code↔slug map. |
| H7 | Code | `bulkSetLeadAction` loses writes but reports success — one duplicate aborts the whole atomic insert, error swallowed, returns `{ok:true}` (`leads.functions.ts:123-125`). | `upsert(..., { onConflict, ignoreDuplicates:true })`. |
| H8 | Code | `getPipelineForecast` has `limit(500)` with no ORDER BY — nondeterministic rows past 500, forecast doesn't reconcile with feed (`leads.functions.ts:334-343`). | Add the same ordering as `listLeads`. |
| H9 | Code | `listLeads` builds NOT-IN by interpolating every dismissed UUID into the querystring — hundreds of dismissals → URL-length failure → whole feed errors (`leads.functions.ts:37-38`). | Filter dismissed IDs in JS, or use an anti-join RPC. |
| H10 | Frontend/UX | Mobile users lose core navigation — Pipeline link, Saved views, sync status are `hidden md:flex` with no fallback; `/settings/keywords` has no inbound link anywhere (`index.tsx:248-276`). | Add a mobile menu + a real settings link. |
| H11 | Frontend/A11y | Hand-rolled modals/drawers have no dialog semantics — no `role="dialog"`, no focus trap/restore, inconsistent Escape/backdrop handling. The accessible shadcn/Radix primitives sit unused in `src/components/ui/`. | Swap to the vendored Dialog/Sheet/Popover/DropdownMenu. |
| H12 | Frontend/UX | Outreach mailto omits the recipient — `mailto:?subject=...` with no `to:` even when the enriched email is known (`OutreachDraftDialog.tsx:88-91`). Breaks the lead→contact→outreach chain. | Prefill `to:` from the best enriched contact; show recipient in the header. |
| H13 | Code/Frontend | In-place state mutation in the copilot stream handler — `last.content += ...` mutates prior-state objects, duplicating text under StrictMode (`CopilotPanel.tsx:50-74`). | Rebuild the last message immutably. |
| H14 | UX | Leads silently vanish due to the default territory text-match filter — a hospital string without a state name is dropped from the default view with no indication (`index.tsx:193-203`, `leads.ts:119-141`), compounded by the invisible default `minConfidence:75`. | Show "N leads hidden by filters — show all" instead of a bare empty state. |

### Medium (selected)

- **Fake 7-Day Trend chart** (`Sidebar.tsx:96`) — compute from `date_discovered` or delete.
- **Dead `Header.tsx`** — delete (fake sync time + fake user).
- **No error states** for primary queries — failures show the misleading "No leads yet"
  empty state (`index.tsx:410-438`, `pipeline.tsx:43`). Branch on `isError` with retry.
- **OutreachDraftDialog clobbers in-progress edits** on refetch/focus (`:45-56`) — seed
  local state only when `draftId===null` or lead id changes; key by lead.
- **AlertsBell dead ends** — alerts resolve only against currently-visible leads
  (`AlertsBell.tsx:46,83-103`); dismissed/aged-out leads render generic text and click
  does nothing. Fetch by id on click or join server-side.
- **`getOrCreateDailyBriefing` race + unchecked insert** (`leads.functions.ts:412-458`)
  — use `upsert(onConflict:"user_id,date")`.
- **PostgREST filter injection in copilot tools** — model-controlled `state`
  interpolated without sanitizing `,()`(`copilot-tools.server.ts:239,288`).
- **No timeout/retry on any Lovable gateway / connector fetch** — a hung call holds the
  Worker until platform kill. Add `AbortSignal.timeout(30_000)` + one retry on 5xx/429.
- **Swallowed DB errors** in ~8 spots (deletes, alert reads, briefing insert, draft
  insert). Share a `throwIfError()` helper.
- **Duplicate detection by `message.includes("duplicate")`** in 5 spots — use code `23505`.
- **`sendOutreachEmail` logs sends as action `"saved"`** — pollutes the saved list; add a
  real `contacted` action value.
- **Follow-up "cron" is imaginary** — inserts `[Follow-up]` draft rows for a sender that
  doesn't exist; table has no `scheduled_at`/`status`.
- **`bulkEnrichApollo` (≤100 calls) / `batchEnrichContacts` (≤50)** can exceed the 60s
  Worker budget — chunk or queue.
- **FilterBar "active" is meaningless** — `minConfidence>0` with default 75 keeps
  "Clear all" always visible (`FilterBar.tsx:203-212,343`). Compare against defaults.
- **Source filter shows raw enums** (`sam_gov`, `cms_open_payments`) — pass `labelFor`.
- **Tap targets below mobile minimums** — `h-7`/`h-8` buttons, 16px checkbox, 9-11px text;
  Dismiss has no undo toast. Bump to `h-10`+ on touch.
- **Type-safety erosion** — `as unknown as Row[]` casts, hand-maintained `LeadRow`
  duplicating `Tables<"leads">`. Use generated-type helpers.
- **`isDiscoveredToday` compares UTC dates in local time** — off-by-one on the headline
  count during evening US usage.
- **No route loaders / SSR** — every route waterfalls skeleton→fetch. Hydrate critical
  queries in loaders via `ensureQueryData`.

### Low

Console noise in production paths; list keys from user data (collision risk);
no `prefers-reduced-motion`; `outline-none` on inputs with weak focus indicators;
unmemoized `LeadCard`; duplicated "last sync" IIFE; 5× duplicated state-code maps;
`.env` committed (publishable keys only — keep service keys out); OG image points at a
Lovable preview URL; `looksLikeRedditUsername` dead branch.

---

## What a medical device rep experiences today

A busy ultrasound rep gets a genuinely good 10-second read on desktop — leads sorted by
confidence, freshness stamps, source badges, territory. Then friction: on a phone,
Pipeline/Saved/sync are simply gone. Enriched contacts give a real tap-to-call `tel:`
link (the app's best moment), but "Draft outreach" → "Open in mail" forces manual typing
of a recipient the app already knows. After a call, notes and "Mark Contacted" do nothing —
so tomorrow a touched lead looks identical to an untouched one, and follow-up tracking
stays in the rep's head. Domain fit is otherwise strong (POCUS titles, ultrasound
competitors, VA/non-VA, NPI/NPPES, FDA recalls, SAM.gov RFPs, CMS Open Payments).

**Missing features a rep would expect, ranked:** lead status / follow-up tracking;
working CRM sync; quota/attainment context on the Pipeline page; GPO/IDN affiliation +
contract vehicle (critical for VA); install base / competitive contract expiry; facility
type + procedure volume; geography/route awareness; push/email alert delivery; Sunshine
Act compliance guardrails on physician outreach.

---

## Recommended sequencing

**Phase 0 — Stop the bleeding (security + trust), do first:**
C1, C2, C5 (one auth story via `authedServerFn` + a sign-in screen, `CRON_SECRET` for
cron), H1 (delete the open edge function), H2/H3 (central + DB-backed Apollo quota),
H5 (gate enrichment behind the CTA). Delete or clearly hide fake data: 7-Day Trend,
`Header.tsx`, the four dead modal buttons.

**Phase 1 — Make the core workflow real:**
C3 (wire "Mark Contacted" + persist notes), C4 (fix dismissed/restore), H12 (mailto
recipient), H10 (mobile nav + tap targets), error states for primary queries.

**Phase 2 — Correctness + hygiene:**
H6–H9, H13, the swallowed-error/duplicate-detection/timeout classes, shared territory
module, prettier + lint as a CI gate, route loaders for SSR, swap hand-rolled overlays
to shadcn primitives (fixes the whole a11y class at once).

**Phase 3 — Domain features for the rep:**
follow-up status pipeline, working CRM round-trip, quota/attainment, GPO/IDN + contract
vehicle, install-base/contract-expiry timing, push/email alerts.
