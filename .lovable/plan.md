
## Plan: Insert Philips Ultrasound research accounts + Apollo sync

The uploaded PDF contains **12 priority accounts** across TX/OK/AR/LA. I'll insert all 12 as new lead rows (separate from the 8 already in the DB — these are different opportunities/contacts, e.g. *Washington Regional* is distinct from the existing *UAMS* row, *Ochsner Medical Center / Fellowship Director search* is distinct from the *Ochsner Health System* fleet row, *OU Health Tulsa / Lori Whelan* is distinct from the existing OU Health row).

### 1. Build the 12 lead inserts

For each account: `source=news`, `enriched=true`, `priority` derived from score (≥8.5 high, ≥7.5 medium‑high → still `high`, otherwise `medium`), confidence = score × 10, plus `hospital`, `territory`, `signal_type`, `estimated_value_usd`, `summary`, `source_url`, `source_contacts[]`, and `entities` (hospitals/physicians/equipment/keywords).

| # | Account | State | Score → Conf | Signal | Est. Value |
|---|---|---|---|---|---|
| 1 | Washington Regional Medical Center (Fayetteville) | AR | 9.5 → 95 | rfp | $450k |
| 2 | Ben Taub Hospital (Harris Health) | TX | 9.0 → 90 | expansion | $750k |
| 3 | Medical City Heart Hospital (Dallas, HCA) | TX | 8.5 → 85 | expansion | $600k |
| 4 | JPS Health Network (Fort Worth) | TX | 8.5 → 85 | expansion | $700k |
| 5 | Our Lady of the Lake Regional MC (Baton Rouge) | LA | 8.0 → 80 | expansion | $400k |
| 6 | UT Health San Antonio / University Hospital | TX | 8.0 → 80 | rfp | $500k |
| 7 | Texas Health Plano | TX | 7.5 → 75 | expansion | $450k |
| 8 | Lyndon B. Johnson Hospital / O'Quinn build (Houston) | TX | 7.5 → 75 | expansion | $900k |
| 9 | OU Health (Tulsa / OKC) — Lori Whelan POCUS | OK | 7.5 → 75 | expansion | $350k |
| 10 | Ochsner Medical Center (New Orleans) — Fellowship Dir search | LA | 7.0 → 70 | rfp | $300k |
| 11 | Texas Health Harris Methodist Fort Worth | TX | 7.0 → 70 | expansion | $250k |
| 12 | Baylor Scott & White Emergency Hospital – Alliance | TX | 6.5 → 65 | expansion | $200k |

Named contacts on `source_contacts` (full name + title + org) include: Jennifer Carnell MD & Esmaeil Porsa MD (Ben Taub); Bruce Bowers MD, Jack Schwade MD, Andrea Daniels RN (Medical City Heart); Nicholas Saltarelli MD, Lynn Roppolo MD, Jennifer Byrd DO (JPS); Mark Laperouse MD, E.J. Kuiper (OLOL); Nilam Soni MD & Jessica Solis-McCarthy MD (UT Health SA); Lori Whelan MD (OU); Claire Harryman MD & Elizabeth Leidinger (Ochsner); Isha Puri MD & Sreenivas Gudimetla MD (THHM Fort Worth); plus the Washington Regional / UAMS EM residency stakeholders.

### 2. Execute via supabase--insert

One `INSERT INTO leads (...) VALUES (...), (...), ...` statement with all 12 rows. After it lands I'll run a `SELECT` to confirm `count = 12` and show the new rows.

### 3. Apollo "sync"

The codebase already wires Apollo via `backfillApolloForLinkedPhysicians` (see `src/lib/apollo/service.server.ts`, daily‑cap‑guarded by `tryConsumeApolloCall`) and runs it automatically at the end of every ingestion run. For these manually‑inserted leads it does NOT auto‑trigger, so I will:

- Insert each named contact into `lead_physicians` (rawName/state/role_hint) using `attachPhysiciansToLead` semantics, then call `backfillApolloForLinkedPhysicians({ limit: 50 })` via a one‑off server invocation against the existing `APOLLO_API_KEY` secret (already in Lovable Cloud secrets).
- Report Apollo usage (`getApolloUsage`) and per‑contact enrichment result counts.

### Verification (what I'll show you at the end)
- `SELECT count(*)` of new rows = 12.
- Table of the 12 new leads: hospital / confidence / signal_type / estimated_value_usd / contact count.
- Apollo backfill summary: contacts attempted, enriched, skipped, daily‑cap remaining.

### Out of scope
- No schema changes, no edits to the ingestion gate or UI defaults (those changes from the previous turn remain).
- No deletion of older low‑confidence rows.
- No re‑run of the public news ingestion pipeline.
