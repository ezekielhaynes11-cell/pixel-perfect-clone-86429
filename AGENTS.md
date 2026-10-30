# Project guidance

- Dashboard routes and server functions operate in zero-login single-user mode (`OWNER_ID`). The `_authenticated` directory is a route group and must never force visitors to sign in; `/auth` redirects directly to `/`.
- All dashboard features — shared lead/contact data, lead notes and status actions, keyword management, page scraping, AI research/drafting, Copilot, manual intelligence refresh, Apollo enrichment/prospecting, HubSpot CRM push, and Gmail outreach — run without operator sign-in.
- Keep scheduled `/api/public/*` webhook endpoints protected by `CRON_SECRET`. Keep Apollo quota checks fail-closed (`tryConsumeApolloCall`) and all user-supplied URL fetches behind `assertSafePublicUrl` and `readCapped` (`src/lib/safe-url.ts`).
