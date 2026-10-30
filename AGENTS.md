# Project guidance

- Dashboard routes are public. The `_authenticated` directory is a route group and must not force visitors to sign in.
- Public server functions expose shared lead/contact data, local lead actions, keyword management, and Apollo enrichment/prospecting. The owner explicitly authorized anonymous Apollo calls, including paid quota use and database writes.
- Keep role checks on AI gateway operations (Copilot, account research, page extraction, outreach generation, ingestion), refresh mutations, and Gmail/CRM integration actions. Optional operator sign-in is available through the More menu; public controls for these actions must be disabled until a session is present. Server-side `requireRep` remains the authorization boundary.
- Keep scheduled `/api/public/*` endpoints protected by `CRON_SECRET`. Keep Apollo quota checks fail-closed and all user-supplied URL fetches behind `assertSafePublicUrl` and `readCapped`.
