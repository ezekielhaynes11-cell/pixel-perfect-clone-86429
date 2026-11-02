import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enrich: vi.fn(),
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      let operation = "select";
      const query: Record<string, unknown> = {};
      const chain = {
        insert: vi.fn(() => {
          operation = "insert";
          return chain;
        }),
        update: vi.fn((value: Record<string, unknown>) => {
          operation = "update";
          if (table === "ingestion_runs") mocks.updates.push(value);
          return chain;
        }),
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn(async () => ({ data: { id: "run-1" }, error: null })),
        then(resolve: (value: unknown) => void) {
          if (table === "leads" && operation === "select") {
            resolve({
              data: [
                {
                  id: "lead-1",
                  source: "sam_gov",
                  source_external_id: "1",
                  source_url: "https://example.com",
                  title: "Hospital ultrasound",
                  summary: "Hospital ultrasound",
                  raw_payload: {},
                  date_discovered: "2026-11-02",
                },
                {
                  id: "lead-2",
                  source: "sam_gov",
                  source_external_id: "2",
                  title: "Hospital imaging",
                  summary: "Hospital imaging",
                  raw_payload: {},
                  date_discovered: "2026-11-02",
                },
              ],
              error: null,
            });
          } else resolve({ data: query, error: null });
        },
      };
      return chain;
    },
  },
}));
vi.mock("./sam-gov.server", () => ({
  fetchSamGov: vi.fn(async () => [
    {
      source: "sam_gov",
      source_external_id: "new",
      source_url: "https://example.com",
      title: "Hospital ultrasound",
      raw_text: "Hospital ultrasound",
      raw_payload: {},
      date_discovered: "2026-11-02",
    },
  ]),
}));
vi.mock("./enrich.server", () => ({ enrichRawLead: mocks.enrich }));
vi.mock("./keywords.server", () => ({ loadKeywords: vi.fn(async () => ({ all: [] })) }));
vi.mock("@/lib/apollo/service.server", () => ({
  backfillApolloForLinkedPhysicians: vi.fn(async () => {}),
}));

import { runIngestionForSource } from "./run.server";

describe("ingestion enrichment failure", () => {
  beforeEach(() => {
    mocks.enrich.mockReset();
    mocks.updates.length = 0;
  });

  it("records an error, keeps the raw count, and stops retrying a quota failure", async () => {
    mocks.enrich.mockRejectedValue(new Error("AI gateway 402: credits exhausted"));
    const result = await runIngestionForSource("sam_gov");
    expect(result).toMatchObject({ fetched: 1, inserted: 1, enriched: 0 });
    expect(result.error).toContain("AI gateway 402");
    expect(mocks.enrich).toHaveBeenCalledTimes(1);
    expect(mocks.updates.at(-1)).toMatchObject({
      status: "error",
      fetched_count: 1,
      new_count: 1,
      enriched_count: 0,
    });
  });
});
