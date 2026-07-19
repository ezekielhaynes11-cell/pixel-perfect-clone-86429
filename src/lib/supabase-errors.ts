// Shared helpers for handling supabase-js / PostgREST errors consistently.
// Replaces ~30 ad-hoc `if (error) throw new Error(error.message)` copies and the
// brittle `error.message.includes("duplicate")` string sniffing scattered across
// the server functions.

import type { PostgrestError } from "@supabase/supabase-js";

// Postgres unique_violation. Detecting duplicates by SQLSTATE code is
// locale/driver-independent, unlike matching on the message text.
export function isUniqueViolation(error: PostgrestError | null | undefined): boolean {
  return error?.code === "23505";
}

// Throw on a real error, ignoring duplicate-key violations (idempotent inserts).
export function throwUnlessDuplicate(
  error: PostgrestError | null | undefined,
  context?: string,
): void {
  if (error && !isUniqueViolation(error)) {
    throw new Error(context ? `${context}: ${error.message}` : error.message);
  }
}

// Throw on any error.
export function throwIfError(error: PostgrestError | null | undefined, context?: string): void {
  if (error) {
    throw new Error(context ? `${context}: ${error.message}` : error.message);
  }
}
