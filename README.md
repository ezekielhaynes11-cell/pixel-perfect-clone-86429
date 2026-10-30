# Yield Architect — Philips Sales Intelligence

Single-user medical device territory intelligence dashboard (TX, OK, AR, LA) built with TanStack Start, React 19, TypeScript, Tailwind CSS, shadcn/ui, and Supabase.

## Architecture & Operating Model

- **Zero-Login Dashboard**: All dashboard views (`/`, `/pipeline`, `/accounts/:id`, `/settings/keywords`) and server functions operate directly without user authentication. Legacy `/auth` links automatically redirect to `/`.
- **Server-Side Data & Integrations**: Browser views invoke typed TanStack Start server functions (`src/lib/*.functions.ts`) validated at the perimeter with Zod schemas and backed by `supabaseAdmin` under the single-user `OWNER_ID`.
- **Cost & Abuse Guardrails**:
  - Apollo enrichment and prospecting enforce a fail-closed atomic daily cap (`consume_apollo_call` RPC in `src/lib/apollo/quota.server.ts`).
  - Hospital/fellowship URL scraping enforces public `http(s)` host validation, private/loopback IP blocking, and a 2 MB response cap (`src/lib/safe-url.ts`).
  - Background cron webhooks (`/api/public/ingest`, `/api/public/apollo-sync-accounts`) require a server-only `CRON_SECRET` header.

## Quickstart

1. Install dependencies:
   ```bash
   npm ci
   ```
2. Copy `.env.example` to `.env.local` for local overrides and configure required credentials.
3. Run development server:
   ```bash
   npm run dev
   ```

## Quality Gates

```bash
npm test            # Vitest unit & boundary tests
npx tsc --noEmit    # Strict TypeScript verification
npm run lint        # ESLint + Prettier verification
npm run build       # Production client + Cloudflare Worker SSR build
```
