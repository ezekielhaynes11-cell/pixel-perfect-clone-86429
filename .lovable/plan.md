## Scope

Ten fixes against the dashboard at `/`, grouped by area. No existing features removed; data preserved.

---

### 1. High Priority KPI (CRITICAL)

`src/routes/index.tsx` currently counts `priority === "high"`, which the AI rarely sets. Replace with a client-side derived rule applied to `activeLeads`:

A lead is high-priority if ANY of:
- `confidence >= 75`, OR
- `estimatedValueUsd >= 50_000`, OR
- `source` is `"openfda"` or `"sam_gov"`, OR
- `accountId` is not null (known account match).

Add `leadIsHighPriority(lead)` helper in `src/data/leads.ts` and use it for the KPI count.

### 2. Most Active Hospital (CRITICAL)

`src/components/dashboard/Sidebar.tsx` falls back to `"Unknown"` when `lead.hospital` is null. Change to:
- Prefer `lead.hospital`
- Else first `lead.entities.hospitals[0]`
- Else skip the lead entirely (don't count "Unknown")
- Render `"—"` only if no lead has any hospital signal.

### 3. Top Opportunity Type (CRITICAL)

Sidebar currently buckets by `specialty`. Replace with an "opportunity type" derived from `signal_type`:

| signal_type | display |
|---|---|
| recall | Regulatory Response |
| rfp | Equipment Replacement |
| funding | New Facility |
| expansion | New Facility |
| m_and_a | Competitive Displacement |
| incumbency | Competitive Displacement |
| sentiment | Market Intelligence |
| other / null | use heuristic: if `vendorMentions.length > 0` → Competitive Displacement, else if `entities.equipment.length > 0` → Clinical Event, else Market Intelligence |

Add `opportunityType(lead)` helper in `src/data/leads.ts`. Only fall back to `"Other"` when none of the above apply.

### 4. Contact Enrichment on Lead Expand (CRITICAL)

**Schema** — new `contact_enrichment` table (migration):
```
lead_id uuid PK references leads(id)
status text  -- 'found' | 'none'
name text, title text, organization text
phone text, email text, linkedin_url text
created_at timestamptz default now()
```
RLS: signed-in read, service_role write; GRANTs per the template rules.

**Server fn** — `enrichLeadContact({ lead_id })` in `src/lib/leads.functions.ts`:
- Return cached row if it exists.
- Else load lead, derive org = `lead.hospital ?? entities.hospitals[0] ?? null`.
- If no org → insert `status='none'` and return.
- Else call `apolloPeopleSearch` (existing client) with `person_titles` in priority order:
  `["VP Supply Chain", "Director Procurement", "CMO", "VP Clinical Operations", "Materials Manager", "Director of Surgery", "CNO"]`, plus `organization_name: org`.
- Pick the first hit, persist, return.

**UI** — in `LeadCard.tsx`, when expanded (modal open, or render inline beneath `ContactSection`):
- Trigger `useQuery(['contact_enrichment', lead.id])` on expand.
- Three badge states under the Contact header:
  - `Enriching…` (yellow, animated pulse) while pending
  - `Contact found` (green) when row.status === 'found'
  - `No contact on file` (orange) when row.status === 'none'
- Render Name, Title, Org, Phone, Email, LinkedIn rows beneath. Reuse the `Row` component from `ContactSection.tsx`.

### 5. 90-day age filter (HIGH)

In `src/routes/index.tsx`, add `const [showOld, setShowOld] = useState(false)` and a toggle button next to "Show dismissed". Apply in `filtered`:
```
if (!showOld && Date.now() - new Date(l.dateDiscovered).getTime() > 90*86400_000) return false
```

### 6. Territory default-on (HIGH)

Add `const [showAllTerritories, setShowAllTerritories] = useState(false)` + toggle button. In `filtered`, when `!showAllTerritories` AND `filters.states.length === 0`, require `leadStateCode(l)` to be one of `TX/OK/AR/LA` (i.e. drop leads that don't resolve to a territory state).

### 7. Min Confidence default 65 (HIGH)

`src/components/dashboard/FilterBar.tsx` — change `emptyFilters.minConfidence` from `0` to `65`. Update the slider step to `5` so users can still dial down.

### 8. "Est. value TBD" (MEDIUM)

`src/components/dashboard/LeadCard.tsx`: when `estimatedValueUsd == null || estimatedValueUsd === 0`, render the badge as `Est. value TBD` (neutral border) instead of `Est. $0k`. Same change in `LeadDetailModal.tsx` if it shows the value.

### 9. Phillips → Philips (POLISH)

Replace literal "Phillips" with "Philips" in:
- `src/routes/index.tsx` line 22 (page title) + line 197 (header badge)
- `src/routes/__root.tsx` lines 76, 80, 81 (title + og + twitter meta)
- `src/components/dashboard/Header.tsx` line 11
- `src/lib/ingest/cms-open-payments.server.ts` comments/strings (lines 5, 7, 117) — string copy only, no logic.
- `src/lib/ingest/reddit.server.ts` UA, `scrape-url.server.ts`, `funding-rss.server.ts` — change `PhillipsLeadRadar` → `PhilipsLeadRadar`.

### 10. Footer credit (POLISH)

`src/routes/index.tsx` line 422: `"Enriched by Lovable AI"` → `"Enriched by Yield AI"`.

---

### Verification

- Reload `/`: KPI shows non-zero high priority; sidebar shows real hospital and a typed opportunity (not "Other" by default).
- Expand a lead: contact section shows an enrichment badge, populates within ~2s, persists on re-expand without a second Apollo call (check `contact_enrichment` row).
- Default feed hides 485-day-old and out-of-territory leads; toggles bring them back.
- Filter chip says "Min Confidence: 65%" on load.
- Search the codebase for "Phillips" / "Lovable AI" → 0 matches in user-visible UI.
- Resize preview to 375px and 1280px — header, KPI row, lead cards, sidebar all reflow.
- Click Save, Dismiss, Draft outreach, View account — each still triggers existing mutations/links.

### Out of scope

- No changes to ingestion sources, NPPES, or existing Apollo physician enrichment.
- No changes to RLS beyond the new `contact_enrichment` table.
- Not re-running the AI enrichment on existing 350 leads — KPI/Sidebar fixes are client-derived so they work against existing data.
