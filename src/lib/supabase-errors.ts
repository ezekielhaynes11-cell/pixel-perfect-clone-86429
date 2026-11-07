// Shared helpers for handling supabase-js / PostgREST errors consistently.
// Restructures raw database schema cache errors, transient network disconnects,
// and unique key violations into typed, user-facing, and resilient error models.

import type { PostgrestError } from "@supabase/supabase-js";

// Postgres unique_violation. Detecting duplicates by SQLSTATE code is
// locale/driver-independent, unlike matching on the message text.
export function isUniqueViolation(error: PostgrestError | null | undefined): boolean {
  return error?.code === "23505";
}

// PostgREST schema cache reload, missing table, or missing RPC indicators.
export function isSchemaCacheError(
  error: PostgrestError | Error | { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = ("code" in error && typeof error.code === "string" ? error.code : "") || "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "PGRST205" || // Table not found in schema cache
    code === "PGRST202" || // Function not found in schema cache
    code === "42P01" || // Undefined table
    code === "42883" || // Undefined function
    msg.includes("schema cache") ||
    msg.includes("could not find the table") ||
    msg.includes("could not find the function")
  );
}

// Transient network, gateway, or connection timeout errors.
export function isTransientNetworkError(
  error: PostgrestError | Error | { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  const code = ("code" in error && typeof error.code === "string" ? error.code : "") || "";
  const msg = (error.message ?? "").toLowerCase();
  return (
    code === "502" ||
    code === "503" ||
    code === "504" ||
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("connection refused") ||
    msg.includes("network error") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout")
  );
}

export type CacheErrorCategory = "schema_cache" | "network_sync" | "auth" | "unknown";

export interface RestructuredError {
  category: CacheErrorCategory;
  isRetryable: boolean;
  userFacingTitle: string;
  userFacingMessage: string;
  technicalDetail: string;
  code?: string;
}

// Domain error class with structured properties for client UI and server telemetry.
export class DataCacheError extends Error {
  readonly category: CacheErrorCategory;
  readonly isRetryable: boolean;
  readonly userFacingTitle: string;
  readonly userFacingMessage: string;
  readonly technicalDetail: string;
  readonly code?: string;

  constructor(restructured: RestructuredError) {
    super(restructured.userFacingMessage);
    this.name = "DataCacheError";
    this.category = restructured.category;
    this.isRetryable = restructured.isRetryable;
    this.userFacingTitle = restructured.userFacingTitle;
    this.userFacingMessage = restructured.userFacingMessage;
    this.technicalDetail = restructured.technicalDetail;
    this.code = restructured.code;
  }
}

// Transform raw database schema cache errors or transient connection faults into
// actionable, executive-level error models that can be rendered without alarming the user.
export function restructureCacheDataError(
  error: unknown,
  context?: string,
): RestructuredError {
  const errObj = error as { code?: string; message?: string } | null | undefined;
  const rawMsg =
    errObj?.message ?? (error instanceof Error ? error.message : String(error ?? "Unknown error"));
  const code = errObj?.code;

  if (isSchemaCacheError(errObj)) {
    return {
      category: "schema_cache",
      isRetryable: true,
      userFacingTitle: "Intelligence Cache Synchronizing",
      userFacingMessage:
        "The sales intelligence database cache is synchronizing with the cloud repository. Displaying verified local intelligence while reconnecting.",
      technicalDetail: rawMsg,
      code: code ?? "PGRST205",
    };
  }

  if (isTransientNetworkError(errObj)) {
    return {
      category: "network_sync",
      isRetryable: true,
      userFacingTitle: "Network Cache Reconnecting",
      userFacingMessage:
        "Temporary cloud connection latency detected. Re-establishing link to sales intelligence data feeds.",
      technicalDetail: rawMsg,
      code: code ?? "NET_TIMEOUT",
    };
  }

  const prefix = context ? `${context}: ` : "";
  return {
    category: "unknown",
    isRetryable: true,
    userFacingTitle: context ?? "Sales Intelligence Sync Notice",
    userFacingMessage: `${prefix}${rawMsg}`,
    technicalDetail: rawMsg,
    code,
  };
}

// Throw on a real error, ignoring duplicate-key violations (idempotent inserts).
export function throwUnlessDuplicate(
  error: PostgrestError | null | undefined,
  context?: string,
): void {
  if (error && !isUniqueViolation(error)) {
    if (isSchemaCacheError(error)) {
      throw new DataCacheError(restructureCacheDataError(error, context));
    }
    throw new Error(context ? `${context}: ${error.message}` : error.message);
  }
}

// Throw on any error, restructuring schema cache faults into DataCacheError.
export function throwIfError(error: PostgrestError | null | undefined, context?: string): void {
  if (error) {
    if (isSchemaCacheError(error)) {
      throw new DataCacheError(restructureCacheDataError(error, context));
    }
    throw new Error(context ? `${context}: ${error.message}` : error.message);
  }
}
