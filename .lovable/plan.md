## Diagnosis
The published build can't reach Supabase because the `VITE_*` env vars aren't included in the deployed bundle.

- `.env` exists locally with both server vars (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`) **and** the client-side `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` that the browser client reads via `import.meta.env.*`.
- `.gitignore` line 33 is `.env`, so the file is excluded from the repo and therefore from the production build. At publish time Vite has no values to inline → the browser-side Supabase client initializes with `undefined`, every query fails, and the feed renders empty.
- Preview works because the dev sandbox loads `.env` from disk directly.

This matches a known Lovable + Vite failure pattern.

(Side note: the console "hydration mismatch" with `data-gr-c-s-check-loaded` / `data-gr-ext-installed` is from the Grammarly browser extension injecting attributes into `<body>` — not related to this bug, no fix needed.)

## Fix
1. Remove the `.env` line from `.gitignore` so the managed `.env` (containing only the public `VITE_*` Supabase keys + URL — which are safe to ship) is included in the deployed build.
2. Verify `.env` still contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (it does).
3. Tell you to click **Publish → Update** to redeploy the frontend (backend changes already auto-deploy; this is a frontend asset change).
4. After redeploy, confirm the published site loads leads.

## What I will NOT do
- Won't expose any secret. The `VITE_*` keys are the publishable (anon) keys — designed to be public, protected by RLS. The service-role key is NOT in `.env` (it's only in Lovable Cloud secrets), so it cannot leak.
- Won't hardcode the URL/key into source.
- Won't touch `src/integrations/supabase/client.ts` (auto-generated).
- Won't change any application code or schema.
