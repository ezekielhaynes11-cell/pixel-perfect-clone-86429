# Always-visible Contact section + SAM.gov POC capture

## Problem

Contacts on the feed today come only from `physician_contacts` (NPPES + Apollo). When a lead has no linked physician, the card shows nothing. SAM.gov opportunities ship a `pointOfContact[]` array (contracting officer, etc.) in `raw_payload`, but it is never surfaced. openFDA and GDELT have no contact data, but the UI gives no signal explaining the absence.

## Fix

Two parts: persist SAM.gov POCs as first-class data, and render a Contact section on every lead — always visible, with "Not available" per missing field and a "No contact on file" badge when nothing exists.

## 1. Data — capture SAM.gov pointOfContact

**Schema** — add one nullable jsonb column to `leads`:

```text
source_contacts jsonb  -- normalized array of LeadContact, default null
```

`LeadContact` shape (stored as JSON, also the UI type):

```text
{ name, title, organization, email, phone, address, type, source_origin }
```

**`src/lib/ingest/types.ts`** — extend `RawLead`:

```text
source_contacts?: LeadContact[]
```

**`src/lib/ingest/sam-gov.server.ts`**:
- Type the `pointOfContact[]` array on `SamOpportunity`.
- Map each POC to `LeadContact`:
  - `name` = `[firstName, middleName, lastName].filter(Boolean).join(" ")` or `fullName` fallback
  - `title` = `title`
  - `organization` = `o.department` / `o.subTier` / `o.officeAddress?.name`
  - `email`, `phone`, `type` (e.g. `primary` / `secondary`)
  - `address` = formatted `o.officeAddress` (street, city, state, zip) — POCs typically inherit office address
- Attach `source_contacts` to the `RawLead`.
- Also append a short POC block to `raw_text` so the enrichment LLM can reference it in the summary.

**`src/lib/ingest/openfda.server.ts`, `gdelt.server.ts`** — leave `source_contacts` undefined. (FDA enforcement does include `recalling_firm` address; we can optionally include it as an `organization`-only contact, but treat as out of scope for this plan to keep the diff small. Mention this as a future enhancement.)

**`src/lib/ingest/run.server.ts`** — when inserting the lead row, persist `source_contacts: raw.source_contacts ?? null`.

**`src/lib/leads.functions.ts`** — add `source_contacts` to `LEAD_LIST_COLUMNS` and to `LeadRow` / `Lead` types (`src/data/leads.ts`), mapped through `rowToLead`.

## 2. UI — always-on Contact section

**New component `src/components/dashboard/ContactSection.tsx`**:
- Accepts `sourceContacts: LeadContact[]` and `physicians: LeadPhysician[]`.
- Normalizes both into a unified `LeadContact[]` (physician → `{ name: full_name, title, organization: practice (city/state), email, phone: practice_phone, address: practice_address }`).
- Renders a "Contact" header. For each contact, renders six labelled rows: Name, Title, Organization, Phone, Email, Address. Missing values render `<span className="text-muted-foreground italic">Not available</span>` — rows never disappear.
- Multi-contact: collapsible list, first contact expanded by default.
- Zero contacts: render the section anyway with all six rows showing "Not available" plus a `No contact on file` badge with tooltip "This source did not include contact data."

**`src/components/dashboard/LeadCard.tsx`**:
- Replace the conditional `{physicians.length > 0 && ...}` block with `<ContactSection sourceContacts={lead.sourceContacts ?? []} physicians={physicians} />` — always rendered.
- Keep the existing physician details (specialty, Apollo badge, LinkedIn) inside `ContactSection` so nothing regresses.

**`src/components/dashboard/LeadDetailModal.tsx`**:
- Add the same `<ContactSection />` above the existing entity grid. Pass `physicians` (modal currently doesn't receive them — wire through from the parent that opens the modal, or fetch via `listLeadPhysicians` once if simpler — pick the prop route, parents already have the data via `useLeadPhysicians`).

## 3. Files touched

```text
supabase migration         add leads.source_contacts jsonb
src/lib/ingest/types.ts    +LeadContact, RawLead.source_contacts
src/lib/ingest/sam-gov.server.ts   map pointOfContact[]
src/lib/ingest/run.server.ts       persist source_contacts
src/lib/leads.functions.ts         include in LEAD_LIST_COLUMNS
src/data/leads.ts                  +sourceContacts on Lead
src/components/dashboard/ContactSection.tsx   (new)
src/components/dashboard/LeadCard.tsx         use ContactSection
src/components/dashboard/LeadDetailModal.tsx  use ContactSection + receive physicians prop
src/routes/index.tsx (or wherever modal mounts)  pass physicians to modal
```

## 4. Verification

- Run a SAM.gov ingestion; query `select source_contacts from leads where source='sam_gov' limit 5;` — expect populated arrays.
- Open a SAM.gov lead in the feed → Contact section lists the contracting officer with email/phone.
- Open an openFDA or GDELT lead → Contact section shows six "Not available" rows + "No contact on file" badge.
- Open a lead linked to a NPPES physician → Contact section shows physician contact, no badge.

## 5. Out of scope

- No changes to Apollo enrichment, NPPES pipeline, or the bulk-enrich button.
- openFDA/GDELT contact extraction beyond the "No contact on file" badge.
- No backfill script for the existing SAM.gov rows already in `leads` (their `raw_payload` still has `pointOfContact` — a one-off migration could repopulate, but is deferred unless you want it).
