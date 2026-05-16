## Plan: Physician contacts + scheduled ingestion

### 1. NPPES physician enrichment (free, no API key)

Add `src/lib/ingest/nppes.server.ts` that calls the public NPPES NPI Registry API (`https://npiregistry.cms.hhs.gov/api/?version=2.1`). For every physician name surfaced by the enrichment step, look up:

- **NPI number** (the unique 10-digit national ID)
- **Primary specialty / taxonomy** (e.g. "Radiology", "Cardiology")
- **Practice address** (street, city, state, ZIP)
- **Practice phone**
- **Credentials** (MD, DO, etc.)

Hook it into `enrich.server.ts` so that after the AI extracts physician names, each name is resolved against NPPES. Cache results in a new `physician_contacts` table keyed by NPI to avoid re-hitting the API.

**Schema change** (one migration):
- `physician_contacts` table: `npi`, `full_name`, `credentials`, `primary_specialty`, `practice_address`, `practice_city`, `practice_state`, `practice_zip`, `practice_phone`, `last_verified_at`. Public-readable since it's all public registry data.
- `lead_physicians` join table: `lead_id`, `npi`, `role` (e.g. "named in source", "CMS payment recipient"). Lets one physician appear on many leads and vice-versa.

**UI change:** `LeadCard.tsx` gets a small "Physicians" section listing each linked contact with specialty, phone, and city — collapsed by default, expand on click.

**Limitations to flag upfront:** NPPES does NOT contain email addresses or direct mobile numbers — only the practice's front-desk line and mailing address. If he wants direct emails later, that's a paid API (Apollo / Hunter / Definitive Healthcare) we can add as a Tier-2 upgrade.

### 2. Scheduled ingestion — twice daily

Enable `pg_cron` + `pg_net` extensions, then schedule the existing `/api/public/ingest` endpoint to run:

- **14:00 UTC** (7:00 AM Pacific) — morning briefing data
- **20:00 UTC** (1:00 PM Pacific) — afternoon refresh

Authenticated via the `apikey` anon header (the project's standard pattern). Job name: `phillips-ingest-daily`.

Replaces the never-installed every-30-min job from the earlier plan.

### 3. Volume expectations (documented in dashboard)

Add a small "What to expect" tooltip on the dashboard header so he knows what's normal:

```text
Per refresh (twice/day):     20–60 new leads
Per week:                    200–400 new leads
Worth opening (conf ≥ 75):   50–100 / week
```

If he sees ≪ that, something's broken (likely an API key or a source returning 0).

### Technical notes

- NPPES API is unauthenticated, ~5 req/sec rate-limit-friendly. We'll batch lookups with a small in-handler delay.
- Physician matching by name is fuzzy. We'll require last name + state match before linking, and store the match confidence so bad links can be filtered out later.
- CMS Open Payments source already produces *real* NPIs — those skip the fuzzy match and link directly.
- The cron uses the stable `project--{id}.lovable.app` URL so it survives republishes.

### What this plan does NOT include

- Paid email/phone enrichment (Apollo, Hunter) — user chose free-only.
- More frequent than twice-daily ingestion — user chose 7am + 1pm PT.
- Any other Tier-2 sources from the earlier roadmap.
