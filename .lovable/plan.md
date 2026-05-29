# Pre-Publish Beta QA Checklist

Run through each item in order in the preview. Mark ✅ / ❌ / ⚠️ and note anything off. Apollo items hit the live API and burn credits — minimize repeats.

## 0. Environment sanity
- [ ] Preview loads without console errors (open DevTools first)
- [ ] No "REPLACE this" / placeholder content on `/`
- [ ] Favicon, page title, and meta description set on landing

## 1. Auth
- [ ] `/login` renders; email+password signup works
- [ ] Google sign-in works (if enabled)
- [ ] Email verification required (unless explicitly disabled)
- [ ] After login, redirected to dashboard
- [ ] Logout clears session, blocks protected routes
- [ ] Hitting `/_authenticated/*` while signed-out redirects to `/login`

## 2. Dashboard / Home
- [ ] Summary cards show real numbers (leads today, week, enriched, etc.)
- [ ] **"Last sync" timestamp is in user's local TZ, not PST** (regression check)
- [ ] No "AI enrichment" copy on summary cards (regression check)
- [ ] Top leads list renders, links to lead detail
- [ ] Empty state renders cleanly for brand-new user

## 3. Ingestion
- [ ] "Run ingestion" / sync button starts a run
- [ ] `ingestion_runs` row appears (status `running` → `success`)
- [ ] **No "upstream request timeout" error** on sam.gov (regression check)
- [ ] Failed runs surface error text in UI, not just spin
- [ ] New leads land in `leads` table with source, title, summary populated
- [ ] Retrying after a failure works

## 4. Leads list & filters
- [ ] Leads page paginates / loads without hitting 1000-row cap silently
- [ ] State / territory filter returns results for TX, OK, AR, LA (case-insensitive)
- [ ] Priority / signal-type / account-type filters work
- [ ] Search box matches title, summary, hospital
- [ ] Sort by date/confidence works
- [ ] Empty filter result shows "no matches" with reset

## 5. Lead detail modal
- [ ] Opens from list, URL is shareable
- [ ] Title, summary, source link, hospital, territory, vendor mentions all render
- [ ] Linked physicians render with NPI; rows show enrichment state
- [ ] "Save", "Dismiss", "Mark contacted" actions persist to `lead_actions`
- [ ] Generate outreach draft → produces subject + body, saves to `outreach_drafts`
- [ ] Per-physician **Apollo Enrich** button (live):
  - [ ] Pulls email, title, LinkedIn for at least one known physician
  - [ ] `physician_contacts.apollo_enriched_at` updates
  - [ ] No-match case shows graceful message, no crash

## 6. Copilot
- [ ] Chat opens, message history persists across reload
- [ ] **Asks "leads in Texas" → returns results** (regression: was "no results")
- [ ] Asks "leads about robotic surgery" → text_search returns matches
- [ ] Asks something with zero matches → tries broader query before giving up
- [ ] Cites lead IDs / links back to lead detail
- [ ] Markdown renders (lists, bold, links)
- [ ] Tool calls visible/transparent (or at least not breaking UI)
- [ ] Apollo tools work from chat:
  - [ ] "Enrich account <Name>" → fills domain + employee count
  - [ ] "Prospect cardiologists at <Account>" → creates physician_contacts rows
  - [ ] "Enrich Dr. <Name>" → fills email/title/LinkedIn

## 7. Accounts
- [ ] Accounts list renders, search works
- [ ] Account detail page loads brief, linked leads, physicians
- [ ] **Account Brief → "Enrich (Apollo)"** (live): domain + employee_count populate, `apollo_enriched_at` set, button disables while running
- [ ] **Prospect (Apollo) dialog** (live): titles + keywords form submits, new contacts appear with `npi: APL-…`, dedupes on re-run
- [ ] Generate brief writes to `account_briefs`, markdown renders, sources cited

## 8. Saved searches & alerts
- [ ] Save current filter as search
- [ ] Saved searches list shows item, can delete
- [ ] Alert toggle persists
- [ ] (If wired) alerts row created when matching lead arrives

## 9. Briefings
- [ ] "Generate daily briefing" produces markdown with top leads
- [ ] Stored in `briefings`, retrievable on reload
- [ ] Top lead links work

## 10. Permissions / RLS
- [ ] Second test user can't see first user's `saved_searches`, `alerts`, `briefings`, `outreach_drafts`, `lead_actions`
- [ ] Non-admin cannot mutate `leads`, `accounts`, `keyword_lists` from client
- [ ] Apollo writes happen server-side only (no service-role key in browser)

## 11. Errors & edge cases
- [ ] Disconnect network → app shows toast / error, doesn't white-screen
- [ ] Visit `/some-bogus-route` → notFoundComponent renders
- [ ] Force an error in a loader → errorComponent + Retry actually re-runs
- [ ] Long titles / summaries don't overflow cards
- [ ] Mobile width (375px): nav, dashboard, lead modal, Copilot all usable

## 12. Performance / polish
- [ ] No unexplained 4xx/5xx in Network tab during normal flow
- [ ] Server function logs clean (`stack_modern--server-function-logs`)
- [ ] Database linter clean (`supabase--linter`)
- [ ] Security scan clean (`security--run_security_scan`)
- [ ] `APOLLO_API_KEY` and `SAM_GOV_API_KEY` present as secrets, not in code
- [ ] Lighthouse / quick a11y pass: contrast, alt text, single H1

## 13. Publish settings
- [ ] Confirm publish visibility (public vs private workspace-only)
- [ ] Custom domain (if any) wired
- [ ] Decide on "Edit with Lovable" badge

---

**Reporting format** when you find issues, paste back as:
`#<section>.<item>` — short description — repro steps. I'll triage and fix in build mode.