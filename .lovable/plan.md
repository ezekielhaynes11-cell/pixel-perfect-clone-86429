## Goal
Insert the 8 priority TX/OK/AR/LA Philips-ultrasound accounts into `public.leads` as high-confidence, top-of-feed rows so they appear in the dashboard Monday morning. No app code changes.

## How it will run
- Use the Lovable Cloud **insert tool** (server-side, service-role) — same trust boundary as the `.env` service role key you mentioned, but I never have to handle the key directly.
- One `INSERT ... RETURNING id, title, hospital, territory, confidence, source` covering all 8 rows in a single statement.
- Then a `SELECT` to confirm the inserted rows and IDs.

## Field mapping (your spec → actual `leads` schema)
The `leads` table doesn't have `contact_enrichment`, `enrichment_status`, `philips_relevance_score`, or `published_at` columns. Mapping to what exists:

| Your field | DB column | Notes |
|---|---|---|
| title | `title` | as given |
| summary | `summary` | as given |
| hospital | `hospital` | as given |
| territory | `territory` | 2-letter code (TX/OK/AR/LA) — matches `leadStateCode()` regex |
| signal_type | `signal_type` | expansion / rfp |
| source | `source` | `strategic_intelligence_report` (new value; frontend will display under "news" bucket since it's not in `LeadSource` union, but it WILL show in feed) |
| confidence | `confidence` | 95/90/85/80/75/70/75/70 |
| estimated_value_usd | `estimated_value_usd` | as given |
| contact (name/title/org) | `source_contacts` jsonb array `[{name,title,organization,...}]` | this is the existing contact column |
| enrichment_status: 'found' | `enriched = true` | required so the row passes the server `enriched=true` filter |
| philips_relevance_score: 95 | stored in `raw_payload.philips_relevance_score` | no dedicated column |
| published_at: NOW() | `date_discovered = NOW()` | also satisfies the 365-day frontend gate |
| — | `source_external_id` | required NOT NULL — synthetic `strategic_report_2026_06_03_<slug>` |
| — | `priority` | `'high'` for all 8 |
| — | `account_type` | `'va'` for the two VA rows, `'academic_medical_center'` for the rest, `'military'` for SAUSHEC |
| — | `entities` | `{hospitals:[…], physicians:[contact name], equipment:["ultrasound"], keywords:[…]}` |
| — | `vendor_mentions` | `["Philips"]` (plus GE/Mindray for UAMS) |

## Post-insert verification
1. `SELECT count(*) FROM leads WHERE source='strategic_intelligence_report'` → expect 8
2. `SELECT id, hospital, territory, confidence, signal_type, estimated_value_usd FROM leads WHERE source='strategic_intelligence_report' ORDER BY confidence DESC`
3. Confirm `enriched=true` and `territory` is TX/OK/AR/LA on every row so they pass server + frontend filters.

## What I will NOT do
- Not running Apollo enrichment (you said these are already enriched).
- Not editing `enrich-contact`, the ingestion pipeline, or any client code.
- Not adding a `contact_enrichment` / `enrichment_status` / `philips_relevance_score` / `published_at` column — would require a migration; mapping to existing columns is sufficient unless you want me to add them.

## Confirm before I run
- OK to use `source='strategic_intelligence_report'` (new source value) vs. an existing one like `'sam_gov'`?
- OK to fold `philips_relevance_score: 95` into `raw_payload` instead of adding a column?
