## Goal

Patch 7 existing leads with the strategic decision-maker contacts, titles, emails, phones, LinkedIn URLs, and clinical/procurement analysis you provided. Store contacts in `source_contacts` JSONB and the strategic context in `raw_payload.strategic_brief`. Bypass Apollo entirely — these are flagged as manually verified.

## Lead → Existing Row Mapping

All 7 accounts already exist in `leads`, so this is an UPDATE pass (no new lead rows, no duplicates):

| # | Account | lead_id | Notes |
|---|---|---|---|
| 1 | Medical City Heart Hospital | `b9b0e538…` | Already has Mahr/Schwade/Daniels stubs from earlier patch — replace with full enriched contacts |
| 2 | Texas Health Presbyterian Plano | `55a9aa3e…` | Add Modak, Peterman + exec table (Abernathy, Massey, Hadzima) |
| 3 | Augusta University Medical Center (MCG) | `c9856ad6…` | Henson, Vale, Munn. **Also fix `territory` from `louisiana` → `georgia`** (existing row is mis-tagged) |
| 4 | UTSW — PJI Bubble Study | `0a11057d…` | Chen, Tatara, Estrera |
| 5 | UTSW Clements — NSICU Neuromonitoring | `e35c8365…` | Jouett, Olson (+ monitoring matrix in brief) |
| 6 | Arkansas Health Group / Baptist Heart | `ce55d622…` | Mego |
| 7 | Texas Mobile Stroke Unit Network | `93c63b7f…` (Memorial Hermann / UTHealth Houston) | Grotta + Parker. **Your message was truncated mid-Stephanie Parker** — see Open Question below |

## Per-Contact Fields Written into `source_contacts[]`

Each object: `{ name, title, email, phone, linkedin, role_tag, verified: true, source: "manual_curation_2026_06" }` where `role_tag` is the "Target Profile" label (e.g. `Clinical Decision-Maker`, `Capital Purchasing Authority`).

Existing unmatched contacts on each lead are preserved (same pattern as the previous patch).

## Per-Lead Fields Written

- `source_contacts` — rebuilt array (preserves unmatched, upserts named contacts)
- `confidence` — bumped to `90` (manual high-confidence verification)
- `enriched` → `true`
- `raw_payload.strategic_brief` — JSON object with `target_profile`, `why_them` per contact, `clinical_procurement_analysis` paragraph, and (where given) `org_chart` / `integration_matrix`
- `raw_payload.manual_verified_at` — timestamp
- `raw_payload.skip_apollo_sync` → `true`

No schema changes; no Apollo calls; no new lead rows.

## Execution

One `UPDATE … FROM (VALUES …)` statement against `public.leads`, scoped to the 7 ids above, using `jsonb_set` to merge `source_contacts` and `raw_payload.strategic_brief`. Then a `SELECT` to verify all 7 rows show the new contacts and brief, plus a quick check of the dashboard feed in the preview.

## Open Question — Lead 7 truncation

Your message cuts off at **Stephanie Parker, RN** (title/email/phone/why not provided) and may have had additional leads after her. Please confirm:

1. Stephanie Parker's title + email + phone (and LinkedIn if known), OR tell me to insert her as `{ name: "Stephanie Parker, RN", role_tag: "Mobile Stroke Program Operations Lead" }` with contact fields `null` and `needs_manual_sourcing: true`.
2. Whether there are more leads beyond #7 I should wait for, or proceed with the 7 above now.

I'll wait for your answer before running the inserts.
