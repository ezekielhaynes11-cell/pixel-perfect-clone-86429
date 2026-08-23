// Persisted, truthful refresh metadata for the dashboard's live-monitoring UI.
//
// The refresh itself still runs through the existing safe ingestion path
// (triggerIngestionForSource → runIngestionForSource). These functions only
// own the *state machine* around it so the UI never fabricates a sync.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { throwIfError } from "./supabase-errors";

const ROW_ID = "global";
// A claimed run older than this is considered abandoned (worker died / tab closed)
// and may be re-claimed, so a crash can never wedge the button forever.
const STALE_RUN_MS = 10 * 60 * 1000;
// "Live monitoring" is only truthful if a successful sync landed this recently.
export const LIVE_WINDOW_MS = 26 * 60 * 60 * 1000;

export type RefreshStatusValue = "idle" | "running" | "succeeded" | "failed";

export interface RefreshStatus {
  status: RefreshStatusValue;
  trigger: string | null;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  recordsScanned: number;
  recordsUpdated: number;
  sourcesOk: number;
  sourcesFailed: number;
  errorMessage: string | null;
  isLive: boolean;
  serverTime: string;
}

// Never leak keys/URLs/tokens from upstream error strings into the UI.
function safeMessage(raw: string): string {
  return raw
    .replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*\S+/gi, "$1=***")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function toStatus(row: {
  status: string;
  trigger: string | null;
  last_attempted_at: string | null;
  last_succeeded_at: string | null;
  records_scanned: number;
  records_updated: number;
  sources_ok: number;
  sources_failed: number;
  error_message: string | null;
}): RefreshStatus {
  const succeeded = row.last_succeeded_at ? new Date(row.last_succeeded_at).getTime() : 0;
  return {
    status: (row.status as RefreshStatusValue) ?? "idle",
    trigger: row.trigger,
    lastAttemptedAt: row.last_attempted_at,
    lastSucceededAt: row.last_succeeded_at,
    recordsScanned: row.records_scanned ?? 0,
    recordsUpdated: row.records_updated ?? 0,
    sourcesOk: row.sources_ok ?? 0,
    sourcesFailed: row.sources_failed ?? 0,
    errorMessage: row.error_message,
    isLive: succeeded > 0 && Date.now() - succeeded < LIVE_WINDOW_MS,
    serverTime: new Date().toISOString(),
  };
}

const SELECT_COLS =
  "status, trigger, last_attempted_at, last_succeeded_at, records_scanned, records_updated, sources_ok, sources_failed, error_message, updated_at";

export const getRefreshStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("refresh_state")
    .select(SELECT_COLS)
    .eq("id", ROW_ID)
    .maybeSingle();
  throwIfError(error);
  if (!data) {
    return {
      status: "idle" as RefreshStatusValue,
      trigger: null,
      lastAttemptedAt: null,
      lastSucceededAt: null,
      recordsScanned: 0,
      recordsUpdated: 0,
      sourcesOk: 0,
      sourcesFailed: 0,
      errorMessage: null,
      isLive: false,
      serverTime: new Date().toISOString(),
    } satisfies RefreshStatus;
  }
  // Auto-expire an abandoned "running" claim so the UI doesn't lie about being busy.
  if (data.status === "running" && data.updated_at) {
    if (Date.now() - new Date(data.updated_at).getTime() > STALE_RUN_MS) {
      const { data: cleared } = await supabaseAdmin
        .from("refresh_state")
        .update({
          status: "failed",
          error_message: "Refresh timed out before reporting a result. Try running it again.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ROW_ID)
        .eq("status", "running")
        .select(SELECT_COLS)
        .maybeSingle();
      if (cleared) return toStatus(cleared);
    }
  }
  return toStatus(data);
});

/** Claim the refresh lock. Throws if another run is already in flight. */
export const beginRefresh = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({ trigger: z.enum(["manual", "auto"]).default("manual") })
      .parse(input ?? { trigger: "manual" }),
  )
  .handler(async ({ data }) => {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - STALE_RUN_MS).toISOString();

    const { data: current } = await supabaseAdmin
      .from("refresh_state")
      .select("status, updated_at")
      .eq("id", ROW_ID)
      .maybeSingle();

    if (
      current?.status === "running" &&
      current.updated_at &&
      current.updated_at > staleBefore
    ) {
      throw new Error("A refresh is already running. Please wait for it to finish.");
    }

    const payload = {
      id: ROW_ID,
      status: "running",
      trigger: data.trigger,
      last_attempted_at: now.toISOString(),
      error_message: null,
      records_scanned: 0,
      records_updated: 0,
      sources_ok: 0,
      sources_failed: 0,
      updated_at: now.toISOString(),
    };
    const { data: row, error } = await supabaseAdmin
      .from("refresh_state")
      .upsert(payload, { onConflict: "id" })
      .select(SELECT_COLS)
      .maybeSingle();
    throwIfError(error);
    return row ? toStatus(row) : null;
  });

/** Record the outcome of a refresh run. */
export const completeRefresh = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        ok: z.boolean(),
        recordsScanned: z.number().int().min(0).default(0),
        recordsUpdated: z.number().int().min(0).default(0),
        sourcesOk: z.number().int().min(0).default(0),
        sourcesFailed: z.number().int().min(0).default(0),
        errorMessage: z.string().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status: data.ok ? "succeeded" : "failed",
      records_scanned: data.recordsScanned,
      records_updated: data.recordsUpdated,
      sources_ok: data.sourcesOk,
      sources_failed: data.sourcesFailed,
      error_message: data.errorMessage ? safeMessage(data.errorMessage) : null,
      updated_at: now,
    };
    if (data.ok) update.last_succeeded_at = now;
    const { data: row, error } = await supabaseAdmin
      .from("refresh_state")
      .update(update)
      .eq("id", ROW_ID)
      .select(SELECT_COLS)
      .maybeSingle();
    throwIfError(error);
    return row ? toStatus(row) : null;
  });
