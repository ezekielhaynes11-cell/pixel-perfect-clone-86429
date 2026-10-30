// Daily cap for paid Apollo.io API calls, backed by the `apollo_usage` table and
// the atomic `consume_apollo_call` RPC (see migration 20260718010000). Every
// Apollo request is metered centrally in client.server.ts#call(), so this is the
// single source of truth for the cap — no matter which isolate serves it.
//
// Fail closed when usage cannot be recorded. Public enrichment must never bypass
// the durable daily spending cap during a database outage.

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

// Atomically consume one call. Only an explicit successful reservation allows spend.
export async function tryConsumeApolloCall(): Promise<boolean> {
  const cap = currentCap();
  try {
    const { data, error } = await supabaseAdmin.rpc(
      "consume_apollo_call" as never,
      { p_cap: cap } as never,
    );
    if (error) {
      console.error("[apollo quota] consume_apollo_call failed, blocking request:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error(
      "[apollo quota] consume_apollo_call threw, blocking request:",
      e instanceof Error ? e.message : e,
    );
    return false;
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
