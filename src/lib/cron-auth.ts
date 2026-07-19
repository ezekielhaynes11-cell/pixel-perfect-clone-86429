// Shared auth gate for the public cron/webhook endpoints.
//
// These routes trigger paid work (ingestion, Apollo enrichment) so they must NOT
// be authenticated with the Supabase publishable/anon key — that key is shipped
// to every browser via VITE_SUPABASE_PUBLISHABLE_KEY and is effectively public.
//
// Instead they require a dedicated server-only secret, CRON_SECRET, that lives
// only in the Worker/pg_cron environment. Supply it via either header:
//   x-cron-secret: <secret>
//   Authorization: Bearer <secret>
//
// The gate fails closed: if CRON_SECRET is not configured, no request is allowed.

// Length-independent constant-time comparison to avoid leaking the secret via
// response timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return false; // fail closed when unconfigured

  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (!provided) return false;

  return safeEqual(provided, secret);
}

export function cronUnauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}
