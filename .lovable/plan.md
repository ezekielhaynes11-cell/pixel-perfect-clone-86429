# Make the Save button visibly work

## Why it looks broken

The Save click already hits the server and writes to `lead_actions` (the DB has 1 row to prove it). But:

- The mutation in `src/routes/index.tsx:114-118` invalidates `["lead_actions"]` and stops there — no toast, no error surfacing.
- `actionsQ` is only used to compute `dismissedIds`. Saved IDs are never derived.
- `LeadCard`'s Save button (`src/components/dashboard/LeadCard.tsx:233-239`) has no `saved` prop and no active styling — it looks identical before and after.

So clicks succeed but the user sees nothing change. Same path will also feel broken on errors because there's no `onError` toast.

## Changes

### 1. `src/routes/index.tsx`

- Compute `savedIds` next to `dismissedIds` (line 135-138) from `actionsQ.data` where `action === "saved"`.
- Replace the `act` mutation (lines 114-118) with one that:
  - On success, toasts `"Saved"` / `"Unsaved"` based on `variables.remove`, and invalidates `["lead_actions"]`.
  - On error, toasts the error message.
- In the `<LeadCard>` JSX (around line 384), pass `saved={savedIds.has(lead.id)}` and change `onSave` to toggle: `act.mutate({ lead_id: lead.id, action: "saved", remove: savedIds.has(lead.id) })`.

### 2. `src/components/dashboard/LeadCard.tsx`

- Add `saved?: boolean` to the props and destructure it (lines 39-50).
- In the Save button (lines 233-239):
  - Switch label to `"Saved"` when `saved`, else `"Save"`.
  - Apply active styling when saved: `border-primary/40 bg-primary/10 text-primary` (matches the Draft outreach button styling for consistency).
  - Use the `Bookmark` icon with `fill="currentColor"` when saved so it visibly fills in.

### 3. Out of scope

- Switching `setLeadAction` from `OWNER_ID` to authenticated user — belongs with the still-deferred auth surface work.
- Adding a saved-only filter to the dashboard — `SavedSearchesDrawer` is a different feature; not touching it.

## Verification

1. Click Save on any card → toast "Saved", button turns primary-colored, icon fills.
2. Click again → toast "Unsaved", button reverts, icon empties.
3. Reload → previously saved cards still show the filled Saved state.
4. `SELECT action, COUNT(*) FROM lead_actions GROUP BY action` confirms rows added/removed.
