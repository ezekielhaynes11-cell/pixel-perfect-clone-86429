// One-off Apollo sync endpoint for manually-inserted leads.
// POST with body { account_ids: string[], titles?: string[], limit?: number }
// Iterates each account, runs Apollo Org enrichment + Apollo People prospecting,
// and reports per-account results plus daily-cap usage.
// Auth: anon publishable key in `apikey` header (same as /api/public/ingest).

import { createFileRoute } from "@tanstack/react-router";
import {
  apolloEnrichAccount,
  apolloProspectContacts,
} from "@/lib/apollo/service.server";
import { getApolloUsage } from "@/lib/apollo/quota.server";

const DEFAULT_TITLES = [
  "Ultrasound Director",
  "POCUS Director",
  "Director of Emergency Ultrasound",
  "Chief of Emergency Medicine",
  "Medical Director",
  "Director of Cardiology",
  "Chief of Radiology",
  "Residency Program Director",
];

export const Route = createFileRoute("/api/public/apollo-sync-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey =
          request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.SUPABASE_ANON_KEY ??
          "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        let body: { account_ids?: string[]; titles?: string[]; limit?: number };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response(
            JSON.stringify({ ok: false, error: "Invalid JSON body" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
        const ids = Array.isArray(body.account_ids) ? body.account_ids : [];
        const titles =
          body.titles && body.titles.length > 0 ? body.titles : DEFAULT_TITLES;
        const limit = Math.min(body.limit ?? 5, 25);
        if (ids.length === 0 || ids.length > 50) {
          return new Response(
            JSON.stringify({ ok: false, error: "account_ids must be 1-50" }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const results: Array<{
          account_id: string;
          org?: unknown;
          prospect?: unknown;
          error?: string;
        }> = [];
        for (const id of ids) {
          try {
            const org = await apolloEnrichAccount({ account_id: id });
            const prospect = await apolloProspectContacts({
              account_id: id,
              titles,
              limit,
            });
            results.push({ account_id: id, org, prospect });
          } catch (e) {
            results.push({
              account_id: id,
              error: e instanceof Error ? e.message : String(e),
            });
          }
          // Polite spacing
          await new Promise((r) => setTimeout(r, 250));
        }
        return Response.json({
          ok: true,
          apollo_usage: getApolloUsage(),
          results,
        });
      },
    },
  },
});
