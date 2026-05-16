// Public cron + webhook endpoint to trigger ingestion.
// Called by Supabase pg_cron every 30 minutes. Auth via the project's anon `apikey` header.

import { createFileRoute } from "@tanstack/react-router";
import { runIngestion } from "@/lib/ingest/run.server";
import { OWNER_ID } from "@/lib/owner.server";

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const summaries = await runIngestion(OWNER_ID);
          return Response.json({ ok: true, summaries });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apikey !== expected) return new Response("Unauthorized", { status: 401 });
        const summaries = await runIngestion(OWNER_ID);
        return Response.json({ ok: true, summaries });
      },
    },
  },
});
