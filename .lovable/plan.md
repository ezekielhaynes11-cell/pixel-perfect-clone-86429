# Plan: Two Agentic Capabilities

Adding the two highest-impact agents on top of the existing Lead Radar without disturbing the working ingestion/feed/dismiss pipeline.

## 1. Account Research Agent (deep-dive on `/accounts/$id`)

**Goal:** One-click "Research this account" button that autonomously gathers fresh intel and writes a structured brief.

### Backend
- New table `account_briefs` (id, account_id, markdown, structured jsonb, sources jsonb, model, created_at, created_by)
  - RLS: signed-in read; admins write (briefs are insert-only, never user-edited)
- New server fn `researchAccount({ accountId })` in `src/lib/accounts.functions.ts`
  - Agent loop, **max 6 steps** (cost guardrail), single Gemini Flash model
  - Tools the model can call:
    1. `web_search(query)` — reuses existing approach (no new key; uses Lovable AI's grounded search via prompt context, OR a single SAM/GDELT lookup if cheaper)
    2. `scrape_url(url)` — reuses `scrape-url.server.ts`
    3. `read_existing_signals()` — pulls last 50 leads + scraped_pages already in DB for this account (free, no LLM tokens)
    4. `finish(brief)` — structured tool call: { exec_summary, vendor_footprint, capital_plans, key_people, recent_signals, recommended_next_steps, sources[] }
  - Hard stop at 6 tool calls OR when `finish` is called
  - Persists one row in `account_briefs`; returns it

### Frontend
- `/accounts/$id` page: "Research account" button (top right of header)
  - Shows latest existing brief if any (collapsible)
  - Button triggers `researchAccount`, shows step-by-step progress (tool name + brief status)
  - On completion, renders markdown brief + sources list

**Cost control:** Single agent call, capped steps, Flash model, dedup (if brief < 7 days old, prompt to view existing instead of re-running).

---

## 2. Conversational Lead Copilot (sidebar chat)

**Goal:** Natural-language interface over the existing data. Mike can ask "Show VA accounts in TX with ultrasound recall signals this month and draft intros to their POCUS directors."

### Backend
- New server fn `copilotChat({ messages })` in `src/lib/copilot.functions.ts`
  - **Streams** via async generator (per `tanstack-server-functions` AI streaming pattern) — token-by-token
  - Tool-calling loop, **max 8 tool calls per turn** (cost guardrail)
  - Tools exposed to model (all read against existing tables, no new schema):
    1. `query_leads(filters)` — state, signal_type, source, vendor, account_type, min_confidence, date_from, limit≤50
    2. `query_accounts(filters)` — name search, state, is_va, limit≤25
    3. `query_physicians(filters)` — specialty, state, role_hint, limit≤25
    4. `get_account_brief(account_id)` — returns latest brief if exists (lets the copilot reuse Agent #1's output)
    5. `draft_outreach(lead_id, tone)` — reuses existing `outreach.server.ts`
  - System prompt scoped to Philips territory + grounding rules ("only state facts present in tool results")
  - No conversation persistence in v1 (in-memory client state, like a chat panel) — keeps scope tight

### Frontend
- New `<CopilotPanel />` component, slide-over drawer triggered from the dashboard header (sparkle icon next to AlertsBell)
- Messages list with markdown rendering (`react-markdown` — add dep)
- Streams assistant tokens; renders tool calls inline as collapsed chips ("Searching leads… 12 results")
- "Open lead" / "Open account" inline links generated from tool results jump into existing routes
- Mobile: full-screen sheet

### Cost control
- Flash model default (`google/gemini-2.5-flash`)
- Hard step cap (8 tool calls per user turn)
- Per-tool row caps (50 / 25)
- No background polling, no auto-suggestions — only fires on explicit user send

---

## Files

**New**
- `src/lib/accounts.functions.ts` — add `researchAccount` (extend existing file)
- `src/lib/research-agent.server.ts` — agent loop helper
- `src/lib/copilot.functions.ts` — `copilotChat` streaming server fn
- `src/lib/copilot-tools.server.ts` — tool implementations (query_*, draft_outreach wrapper)
- `src/components/dashboard/CopilotPanel.tsx`
- `src/components/dashboard/AccountBrief.tsx` (renders brief + sources)

**Edited**
- `src/routes/accounts.$id.tsx` — Research button + brief display
- `src/routes/index.tsx` — Copilot trigger in header
- `src/components/dashboard/Header.tsx` — sparkle icon button

**Migration**
- `account_briefs` table + RLS

**Dep**
- `react-markdown` (already common; ~30KB)

---

## What I will NOT do (to protect the build & credits)
- No new ingestion source
- No re-architecting existing server fns
- No re-doing the index page; copilot is an additive drawer
- No persistent chat history table in v1 (can add later if Mike wants)
- No new model tier (sticks to existing `google/gemini-2.5-flash` already in use)
- No additional API keys requested

## Execution order
1. Migration: `account_briefs` table (await approval)
2. Implement Account Research Agent (backend + UI on `/accounts/$id`)
3. Implement Copilot (backend + drawer)
4. Smoke test: trigger research on one existing account, ask copilot 2 questions
