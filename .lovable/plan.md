## Goal

Remove the login wall. App opens directly to the dashboard. No sign-in, no `/login`, no Supabase auth in the UI.

## Approach

Since this is a single-user internal tool, switch server functions from per-user (RLS-scoped) to **trusted single-owner** using `supabaseAdmin` (service role, bypasses RLS). The data model already has `user_id` columns, so we use a fixed `OWNER_ID` constant on the server for all writes/reads.

## Changes

### 1. Frontend — drop the auth gate

- **`src/routes/index.tsx`**: remove `useAuth`, `useNavigate` redirect effect, and the `loading || !user` guard. Queries run unconditionally (`enabled: true`). Remove the "Sign out" button in the header.
- **`src/routes/pipeline.tsx`**: same removal.
- **`src/routes/__root.tsx`**: remove `<AuthProvider>` wrapper.
- **`src/routes/login.tsx`**: delete the file.
- **`src/hooks/use-auth.tsx`**: delete (no longer imported).

### 2. Server functions — use admin client, no auth middleware

For each `createServerFn` in `src/lib/leads.functions.ts`, `src/lib/outreach.server.ts` (and any sibling functions file), `src/lib/briefings.server.ts`:

- Remove `.middleware([requireSupabaseAuth])`.
- Replace `context.supabase` with `supabaseAdmin` from `@/integrations/supabase/client.server`.
- Replace `context.userId` with a single constant `OWNER_ID` (defined once in a new `src/lib/owner.server.ts`, value read from a `OWNER_USER_ID` secret, falling back to a generated UUID written into the existing `profiles` row).
- `src/lib/ingest/run.server.ts` and ingest helpers: same swap.

### 3. Database — single owner row

One-time migration to seed an owner profile so `user_id`-typed columns have a valid FK target:

- Insert into `profiles` (and `user_roles` as `admin`) with a fixed UUID. Store that UUID in a new secret `OWNER_USER_ID`.
- Drop the `handle_new_user()` trigger reliance (no new signups happen). The trigger can stay; it just never fires.
- RLS policies stay in place — they're simply bypassed by the service role client. No policy edits needed.

### 4. start.ts — drop auth attacher

- Remove `attachSupabaseAuth` from `functionMiddleware` in `src/start.ts` (no longer needed; nothing sends a bearer token).

## Out of scope

- Multi-user, role-based access, or sharing — the tool is explicitly single-user.
- Public exposure protection: published URL will be open to anyone who knows it. If you want a simple shared-password gate later, that's a separate small task.

## Risk

The published URL becomes fully open. Anyone with the link can view leads, trigger ingestion, and generate AI drafts (each refresh costs Lovable AI credits + SAM.gov quota). Mitigations available later: a single shared password prompt, IP allowlist, or Lovable's site-level password protection.

Confirm and I'll execute.
