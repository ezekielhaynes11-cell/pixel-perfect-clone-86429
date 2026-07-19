// Public cron + webhook endpoint to trigger ingestion.
// Called by Supabase pg_cron every 30 minutes. Auth via a server-only CRON_SECRET
// (x-cron-secret or Authorization: Bearer) — never the public Supabase anon key.
// Optional ?source=sam_gov or ?source=sam_gov,clinicaltrials to run a subset.

import { createFileRoute } from "@tanstack/react-router";
import {
  runIngestion,
  runIngestionForSource,
  INGESTION_SOURCE_NAMES,
  type IngestionSourceName,
} from "@/lib/ingest/run.server";
import { OWNER_ID } from "@/lib/owner.server";
import { isAuthorizedCron, cronUnauthorized } from "@/lib/cron-auth";

async function runFromRequest(request: Request) {
  const url = new URL(request.url);
  const sourceParam = url.searchParams.get("source");
  if (sourceParam) {
    const names = sourceParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const summaries = [] as Awaited<ReturnType<typeof runIngestionForSource>>[];
    for (const n of names) {
      if (!(INGESTION_SOURCE_NAMES as readonly string[]).includes(n)) {
        return Response.json({ ok: false, error: `Unknown source: ${n}` }, { status: 400 });
      }
      summaries.push(await runIngestionForSource(n as IngestionSourceName, OWNER_ID));
    }
    return Response.json({ ok: true, summaries });
  }
  const summaries = await runIngestion(OWNER_ID);
  return Response.json({ ok: true, summaries });
}

export const Route = createFileRoute("/api/public/ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorizedCron(request)) return cronUnauthorized();
        try {
          return await runFromRequest(request);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
      GET: async ({ request }) => {
        if (!isAuthorizedCron(request)) return cronUnauthorized();
        return runFromRequest(request);
      },
    },
  },
});
