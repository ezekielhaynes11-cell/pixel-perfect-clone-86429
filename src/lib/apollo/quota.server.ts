// Daily cap for paid Apollo.io API calls, backed by the `apollo_usage` table and
// the atomic `consume_apollo_call` RPC (see migration 20260718010000). Every
// Apollo request is metered centrally in client.server.ts#call(), so this is the
// single source of truth for the cap — no matter which isolate serves it.
//
// Failure policy: if the DB round-trip errors, we FAIL OPEN (allow the call) so a
// transient database hiccup never takes down enrichment; the cap is best-effort
// overspend protection, not a hard billing gate.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_CAP = 150;

function currentCap(): number {
  const raw = process.env.APOLLO_DAILY_CAP;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Atomically consume one call against today's cap. Returns false only when the
// cap has been definitively reached; returns true on success OR on DB error.
export async function tryConsumeApolloCall(): Promise<boolean> {
  const cap = currentCap();
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "consume_apollo_call" as never,
      { p_cap: cap } as never,
    );
    if (error) {
      console.error("[apollo quota] consume_apollo_call failed, failing open:", error.message);
      return true;
    }
    return data === true;
  } catch (e) {
    console.error(
      "[apollo quota] consume_apollo_call threw, failing open:",
      e instanceof Error ? e.message : e,
    );
    return true;
  }
}

export async function getApolloUsage(): Promise<{ used: number; cap: number; dayKey: string }> {
  const cap = currentCap();
  const dayKey = todayKey();
  // apollo_usage is created by migration 20260718010000 but isn't in the
  // committed generated types yet, so the query builder is accessed through a
  // minimal structural cast rather than `any`.
  type LooseTable = {
    select: (columns: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: { count?: number } | null }>;
      };
    };
  };
  try {
    const table = supabaseAdmin.from("apollo_usage" as never) as unknown as LooseTable;
    const { data } = await table.select("count").eq("day", dayKey).maybeSingle();
    return { used: data?.count ?? 0, cap, dayKey };
  } catch {
    return { used: 0, cap, dayKey };
  }
}
