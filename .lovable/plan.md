## Fixes

### 1. Feed nearly empty (CRITICAL)
`src/routes/index.tsx`
- Change `NINETY_DAYS_MS` → `THREE_SIXTY_FIVE_DAYS_MS = 365 * 86400 * 1000` and rename the "Show older leads" toggle label / tooltip to "older than 365 days".
- `src/components/dashboard/FilterBar.tsx`: `emptyFilters.minConfidence: 65 → 50`.

### 2. Contact enrichment (CRITICAL)
Root cause review: `enrichLeadContact` already exists and uses `supabaseAdmin`. The reason cards show "No contact on file" is that `ContactSection` renders for every card on mount, so Apollo gets hit for hundreds of leads in parallel → quota exhaustion / 429s → caught error writes `status:"none"` rows that then cache forever.

Fixes:
- `src/components/dashboard/LeadCard.tsx`: add local `expanded` state, hide `ContactSection` until user clicks a new "Show contact" toggle (or "View Details"). Pass `leadId` only when expanded so the query is gated by user intent.
- `src/lib/leads.functions.ts` `enrichLeadContact`: when Apollo call throws, **do NOT** upsert a `none` row — return an ephemeral `{status:"none"}` object so the next expand retries. Only cache `found` and the "no org available" terminal case.
- `src/routes/index.tsx` header: replace `last.enriched_count` with a live count from a new `useQuery(["contact_enrichment_count"])` that calls a new server fn `getEnrichedContactCount` (returns `count` of rows where `status='found'`). Display "X enriched". Invalidate this key in `ContactSection` query `onSuccess` when `status==='found'`.
- New server fn `getEnrichedContactCount` in `leads.functions.ts` using `supabaseAdmin.from('contact_enrichment').select('lead_id', {count:'exact', head:true}).eq('status','found')`.

### 3. Duplicate leads (CRITICAL)
`src/routes/index.tsx` `leads` memo: after `rowToLead`, dedupe by normalized `title` keeping the highest `confidence` (tiebreak: newest `dateDiscovered`). Also dedupe by `sourceUrl` when non-empty.

### 4. Data source gaps (HIGH)
`src/routes/index.tsx` footer line 446: build the source list dynamically from `sourceCounts` (sources with ≥1 lead in `activeLeads`), formatted as friendly names (`sam_gov → SAM.gov`, `openfda → openFDA`, `gdelt* → GDELT`, `reddit → Reddit`, `bluesky → Bluesky`, etc.). Fallback to "Live data from active sources" when none.

### 5. Reddit mismatch (HIGH)
`src/components/dashboard/Sidebar.tsx`: extend `sourceColors` to include `sam_gov`, `openfda`, `gdelt`, `gdelt_m_and_a`, `gdelt_va_funding`, `reddit`, `bluesky`, `clinicaltrials`, `cms_open_payments`, `funding_rss`; and map raw source keys to friendly labels (same mapping as #4) so Reddit shows in the Data Sources panel whenever it produces leads. No change to scan status — it will now match.

### 6. Grammar (POLISH)
`Sidebar.tsx` line 46: `Mentioned in ${n} lead${n === 1 ? "" : "s"}`.

## Verification
- Default filters: 300+ leads visible (50% confidence, 365 days, TX/OK/AR/LA).
- Expanding a card triggers enrichment → yellow "Enriching…" → green "Contact found" or orange "No contact on file"; header "X enriched" increments.
- No two cards share the same headline.
- Footer & Data Sources panel reflect only sources that returned leads, including Reddit when present.
- "Mentioned in 1 lead" / "Mentioned in 2 leads" both correct.
