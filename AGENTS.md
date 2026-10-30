
- Every app server function uses `.middleware([requireRep])` (src/lib/rep-auth.ts: signed in + rep/admin role); only `/api/public/*` cron routes skip it and verify `CRON_SECRET`. Why: server functions are public RPC endpoints.
- Dashboard pages live under `src/routes/_authenticated/` (client-only gate to `/auth`). Why: session is in localStorage.
- Server-side fetches of user-supplied URLs must go through `assertSafePublicUrl` + `readCapped` (src/lib/safe-url.ts). Why: SSRF and memory limits.
