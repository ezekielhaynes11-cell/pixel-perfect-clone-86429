import { describe, expect, it, vi, beforeEach } from "vitest";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: fromMock,
  },
}));

import { fetchActiveLeadsWithRetry } from "./leads.functions";

describe("Leads functions resilience & fault-tolerance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries on transient PostgREST schema cache reload (PGRST205) and returns leads", async () => {
    const mockLead = {
      id: "test-lead-1",
      title: "Memorial Hermann Health System RFP",
      confidence: 85,
      date_ingested: new Date().toISOString(),
      enriched: true,
    };

    let callCount = 0;
    fromMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: "PGRST205",
              message: "Could not find the table 'public.leads' in the schema cache",
            },
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: [mockLead],
          error: null,
        }),
      };
    });

    const result = await fetchActiveLeadsWithRetry(new Date().toISOString(), 2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("test-lead-1");
    expect(callCount).toBe(2);
  });

  it("gracefully falls back to latest qualified leads when active cutoff yields 0 leads", async () => {
    const fallbackLead = {
      id: "older-qualified-lead",
      title: "Texas Health Resources Cath Lab Tender",
      confidence: 90,
      enriched: true,
    };

    let queryType = 0;
    fromMock.mockImplementation(() => {
      queryType++;
      if (queryType === 1) {
        // First query (with cutoff) returns empty list
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      // Fallback query (without cutoff) returns historical qualified leads
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [fallbackLead], error: null }),
      };
    });

    const result = await fetchActiveLeadsWithRetry(new Date().toISOString(), 2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("older-qualified-lead");
  });

  it("attempts emergency fallback when query repeatedly throws errors", async () => {
    const emergencyLead = {
      id: "emergency-lead-1",
      title: "St. David's Medical Center CT RFP",
      confidence: 88,
      enriched: true,
    };

    let callCount = 0;
    fromMock.mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        // Retries fail
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockRejectedValue(new Error("Supabase connection timeout")),
        };
      }
      // Emergency fallback succeeds
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [emergencyLead], error: null }),
      };
    });

    const result = await fetchActiveLeadsWithRetry(new Date().toISOString(), 2);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("emergency-lead-1");
  });
});
