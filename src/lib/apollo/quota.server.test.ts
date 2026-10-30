import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

import { tryConsumeApolloCall } from "./quota.server";

describe("Apollo durable quota reservation", () => {
  beforeEach(() => rpc.mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it("permits a request only after a successful reservation", async () => {
    rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    expect(await tryConsumeApolloCall()).toBe(true);
    expect(await tryConsumeApolloCall()).toBe(false);
    expect(await tryConsumeApolloCall()).toBe(false);
  });

  it("blocks requests when the quota database fails", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } })
      .mockRejectedValueOnce(new Error("connection failed"));
    expect(await tryConsumeApolloCall()).toBe(false);
    expect(await tryConsumeApolloCall()).toBe(false);
  });

  it("passes the configured cap or safe default to the reservation RPC", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    vi.stubEnv("APOLLO_DAILY_CAP", "20");
    await tryConsumeApolloCall();
    expect(rpc).toHaveBeenLastCalledWith("consume_apollo_call", { p_cap: 20 });
    vi.stubEnv("APOLLO_DAILY_CAP", "invalid");
    await tryConsumeApolloCall();
    expect(rpc).toHaveBeenLastCalledWith("consume_apollo_call", { p_cap: 150 });
  });

  it("enforces daily cap in-memory when consume_apollo_call RPC is absent from schema cache (PGRST202)", async () => {
    vi.stubEnv("APOLLO_DAILY_CAP", "2");
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message:
          "Could not find the function public.consume_apollo_call(p_cap) in the schema cache",
      },
    });
    expect(await tryConsumeApolloCall()).toBe(true);
    expect(await tryConsumeApolloCall()).toBe(true);
    expect(await tryConsumeApolloCall()).toBe(false);
  });
});
