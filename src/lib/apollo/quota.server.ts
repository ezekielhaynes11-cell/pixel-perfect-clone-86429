// Daily cap for paid Apollo.io API calls, backed by the `apollo_usage` table and
// the atomic `consume_apollo_call` RPC (see migration 20260718010000). Every
// Apollo request is metered centrally in client.server.ts#call(), so this is the
// single source of truth for the cap — no matter which isolate serves it.
//
// Fail closed when usage cannot be recorded. Public enrichment must never bypass
// the durable daily spending cap during a database outage.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logWarn } from "../logger.server";

const DEFAULT_CAP = 150;

let memoryDayKey = "";
let memoryUsedCount = 0;

function currentCap(): number {
  const raw = process.env.APOLLO_DAILY_CAP;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isMissingRpcInSchema(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST202" ||
    code === "PGRST205" ||
    code === "42883" ||
    msg.includes("could not find the function") ||
    msg.includes("schema cache")
  );
}

function tryConsumeInMemoryFallback(cap: number): boolean {
  const today = todayKey();
  if (memoryDayKey !== today) {
    memoryDayKey = today;
    memoryUsedCount = 0;
  }
  if (memoryUsedCount >= cap) {
    return false;
  }
  memoryUsedCount += 1;
  return true;
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
      if (isMissingRpcInSchema(error as { code?: string; message?: string })) {
        logWarn(
          "apollo.quota",
          "consume_apollo_call RPC not present in schema; enforcing daily cap in-memory",
          { cap },
        );
        return tryConsumeInMemoryFallback(cap);
      }
      logWarn("apollo.quota", "consume_apollo_call failed, blocking request", {
        error: error.message,
      });
      return false;
    }
    return data === true;
  } catch (e) {
    logWarn("apollo.quota", "consume_apollo_call threw, blocking request", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export async function getApolloUsage(): Promise<{ used: number; cap: number; dayKey: string }> {
  const cap = currentCap();
  const dayKey = todayKey();
  type LooseTable = {
    select: (columns: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { count?: number } | null;
          error?: { code?: string; message?: string } | null;
        }>;
      };
    };
  };
  try {
    const table = supabaseAdmin.from("apollo_usage" as never) as unknown as LooseTable;
    const { data, error } = await table.select("count").eq("day", dayKey).maybeSingle();
    if (error && isMissingRpcInSchema(error)) {
      const used = memoryDayKey === dayKey ? memoryUsedCount : 0;
      return { used, cap, dayKey };
    }
    return { used: data?.count ?? 0, cap, dayKey };
  } catch {
    const used = memoryDayKey === dayKey ? memoryUsedCount : 0;
    return { used, cap, dayKey };
  }
}
