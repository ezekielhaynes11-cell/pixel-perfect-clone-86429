// Persisted, truthful refresh metadata for the dashboard's live-monitoring UI.
//
// The refresh itself still runs through the existing safe ingestion path
// (triggerIngestionForSource → runIngestionForSource). These functions only
// own the *state machine* around it so the UI never fabricates a sync.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeErrorText } from "./ingest/medical-gate";
import { logWarn } from "./logger.server";

const ROW_ID = "global";
// A claimed run older than 60s (the Worker timeout ceiling) is considered
// abandoned (e.g. tab reloaded or preview hot-swapped) and may be re-claimed.
const STALE_RUN_MS = 60 * 1000;
// Active deduplication window for automatic background triggers across tabs.
const AUTO_DEDUPE_WINDOW_MS = 45 * 1000;
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
  alreadyRunning?: boolean;
}

// Never leak HTML markup, keys, URLs, or tokens from upstream error strings into the UI.
function safeMessage(raw: string): string {
  return sanitizeErrorText(raw, 300);
}

interface RefreshStateRow {
  status: string;
  trigger: string | null;
  last_attempted_at: string | null;
  last_succeeded_at: string | null;
  records_scanned: number;
  records_updated: number;
  sources_ok: number;
  sources_failed: number;
  error_message: string | null;
  updated_at?: string | null;
}

function emptyRefreshStatus(): RefreshStatus {
  return {
    status: "idle",
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
  };
}

function toStatus(row: RefreshStateRow, alreadyRunning = false): RefreshStatus {
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
    errorMessage: row.error_message ? safeMessage(row.error_message) : null,
    isLive: succeeded > 0 && Date.now() - succeeded < LIVE_WINDOW_MS,
    serverTime: new Date().toISOString(),
    ...(alreadyRunning ? { alreadyRunning: true } : {}),
  };
}

export function shouldAutoHealRefreshState(
  row: Pick<RefreshStateRow, "status" | "updated_at" | "error_message">,
  nowMs = Date.now(),
): boolean {
  const isStaleRunning =
    row.status === "running" &&
    Boolean(row.updated_at) &&
    nowMs - new Date(row.updated_at as string).getTime() > STALE_RUN_MS;

  const isLockCollisionError =
    row.status === "failed" &&
    typeof row.error_message === "string" &&
    (row.error_message.toLowerCase().includes("already running") ||
      row.error_message.toLowerCase().includes("timed out before reporting"));

  return isStaleRunning || isLockCollisionError;
}

export function shouldDedupeAutoRefresh(
  trigger: "manual" | "auto",
  current: Pick<RefreshStateRow, "status" | "updated_at"> | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (trigger !== "auto") return false;
  if (!current || current.status !== "running" || !current.updated_at) return false;
  const dedupeBeforeIso = new Date(nowMs - AUTO_DEDUPE_WINDOW_MS).toISOString();
  return current.updated_at > dedupeBeforeIso;
}

const SELECT_COLS =
  "status, trigger, last_attempted_at, last_succeeded_at, records_scanned, records_updated, sources_ok, sources_failed, error_message, updated_at";

export const getRefreshStatus = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data, error } = await supabaseAdmin
      .from("refresh_state")
      .select(SELECT_COLS)
      .eq("id", ROW_ID)
      .maybeSingle();

    if (error) {
      logWarn("refresh.status", "Failed to read refresh_state, returning idle status", {
        error: error.message,
      });
      return emptyRefreshStatus();
    }

    if (!data) {
      return emptyRefreshStatus();
    }

    // Auto-heal an abandoned "running" claim (e.g. tab closed or hot-reloaded mid-sync)
    // or a legacy lock collision error so the UI never gets wedged.
    if (shouldAutoHealRefreshState(data as RefreshStateRow)) {
      const recoveredStatus: RefreshStatusValue = data.last_succeeded_at ? "succeeded" : "idle";
      const { data: cleared } = await supabaseAdmin
        .from("refresh_state")
        .update({
          status: recoveredStatus,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ROW_ID)
        .select(SELECT_COLS)
        .maybeSingle();
      if (cleared) return toStatus(cleared as RefreshStateRow);
    }

    return toStatus(data as RefreshStateRow);
  } catch (err) {
    logWarn("refresh.status", "Exception in getRefreshStatus", {
      error: err instanceof Error ? err.message : String(err),
    });
    return emptyRefreshStatus();
  }
});

/**
 * Claim the refresh lock.
 * - For `auto` triggers: if another run started within AUTO_DEDUPE_WINDOW_MS,
 *   returns `{ alreadyRunning: true }` cleanly without throwing an error.
 * - For `manual` triggers: always claims/renews the lock so a user-initiated
 *   refresh is never blocked by an interrupted tab reload.
 */
export const beginRefresh = createServerFn({ method: "POST" })
  .validator((input) =>
    z
      .object({ trigger: z.enum(["manual", "auto"]).default("manual") })
      .parse(input ?? { trigger: "manual" }),
  )
  .handler(async ({ data }) => {
    try {
      const now = new Date();

      const { data: current } = await supabaseAdmin
        .from("refresh_state")
        .select(SELECT_COLS)
        .eq("id", ROW_ID)
        .maybeSingle();

      if (shouldDedupeAutoRefresh(data.trigger, current as RefreshStateRow | null, now.getTime())) {
        return toStatus(current as RefreshStateRow, true);
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

      if (error) {
        logWarn("refresh.begin", "Failed to upsert refresh_state on beginRefresh", {
          error: error.message,
        });
        return emptyRefreshStatus();
      }
      return row ? toStatus(row as RefreshStateRow) : emptyRefreshStatus();
    } catch (err) {
      logWarn("refresh.begin", "Exception in beginRefresh", {
        error: err instanceof Error ? err.message : String(err),
      });
      return emptyRefreshStatus();
    }
  });

/** Record the outcome of a refresh run. */
export const completeRefresh = createServerFn({ method: "POST" })
  .validator((input) =>
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
    try {
      const now = new Date().toISOString();
      const update = {
        status: data.ok ? "succeeded" : "failed",
        records_scanned: data.recordsScanned,
        records_updated: data.recordsUpdated,
        sources_ok: data.sourcesOk,
        sources_failed: data.sourcesFailed,
        error_message: data.errorMessage ? safeMessage(data.errorMessage) : null,
        updated_at: now,
        ...(data.ok ? { last_succeeded_at: now } : {}),
      };
      const { data: row, error } = await supabaseAdmin
        .from("refresh_state")
        .update(update)
        .eq("id", ROW_ID)
        .select(SELECT_COLS)
        .maybeSingle();

      if (error) {
        logWarn("refresh.complete", "Failed to update refresh_state on completeRefresh", {
          error: error.message,
        });
        return null;
      }
      return row ? toStatus(row as RefreshStateRow) : null;
    } catch (err) {
      logWarn("refresh.complete", "Exception in completeRefresh", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  });
