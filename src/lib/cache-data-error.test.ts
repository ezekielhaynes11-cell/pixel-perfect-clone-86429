import { describe, expect, it } from "vitest";
import {
  isSchemaCacheError,
  isTransientNetworkError,
  restructureCacheDataError,
  DataCacheError,
  throwIfError,
} from "./supabase-errors";

describe("Restructure Cache Data Error System", () => {
  it("identifies PostgREST schema cache errors by code PGRST205", () => {
    const error = {
      code: "PGRST205",
      message: "Could not find the table 'public.leads' in the schema cache",
    };
    expect(isSchemaCacheError(error)).toBe(true);

    const restructured = restructureCacheDataError(error);
    expect(restructured.category).toBe("schema_cache");
    expect(restructured.isRetryable).toBe(true);
    expect(restructured.userFacingTitle).toBe("Intelligence Cache Synchronizing");
    expect(restructured.userFacingMessage).toContain("database cache is synchronizing");
    expect(restructured.technicalDetail).toContain("schema cache");
  });

  it("identifies PostgREST missing RPC schema cache errors by code PGRST202", () => {
    const error = {
      code: "PGRST202",
      message: "Could not find the function public.consume_apollo_call in the schema cache",
    };
    expect(isSchemaCacheError(error)).toBe(true);

    const restructured = restructureCacheDataError(error);
    expect(restructured.category).toBe("schema_cache");
  });

  it("identifies transient network timeout and disconnect errors", () => {
    const error = new Error("TypeError: fetch failed due to connection timeout");
    expect(isTransientNetworkError(error)).toBe(true);

    const restructured = restructureCacheDataError(error);
    expect(restructured.category).toBe("network_sync");
    expect(restructured.isRetryable).toBe(true);
    expect(restructured.userFacingTitle).toBe("Network Cache Reconnecting");
  });

  it("throwIfError transforms schema cache errors into structured DataCacheError instances", () => {
    const error = {
      code: "PGRST205",
      message: "Could not find the table 'public.leads' in the schema cache",
    } as any;

    expect(() => throwIfError(error, "Lead Pipeline")).toThrowError(DataCacheError);

    try {
      throwIfError(error, "Lead Pipeline");
    } catch (e: any) {
      expect(e).toBeInstanceOf(DataCacheError);
      expect(e.category).toBe("schema_cache");
      expect(e.isRetryable).toBe(true);
      expect(e.userFacingTitle).toBe("Intelligence Cache Synchronizing");
    }
  });

  it("handles unknown generic errors cleanly with contextual fallback", () => {
    const error = new Error("Custom calculation discrepancy");
    const restructured = restructureCacheDataError(error, "Pricing Pipeline");
    expect(restructured.category).toBe("unknown");
    expect(restructured.userFacingTitle).toBe("Pricing Pipeline");
    expect(restructured.userFacingMessage).toContain("Custom calculation discrepancy");
  });
});
