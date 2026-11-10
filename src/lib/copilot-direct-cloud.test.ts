import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { executeCopilotChat } from "./copilot.functions";
import * as copilotTools from "./copilot-tools.server";

describe("Restructured Copilot Direct Google Cloud API & Fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("executes deterministic lead query fallback and yields structured markdown when API keys are unset", async () => {
    vi.stubEnv("GOOGLE_CLOUD_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("COPILOT_API_URL", "");

    vi.spyOn(copilotTools, "runCopilotTool").mockResolvedValue({
      count: 2,
      leads: [
        {
          id: "lead-tx-001",
          title: "West Texas Rural Hospital Diagnostic Modernization",
          hospital: "West Texas Medical Center",
          state: "TX",
          specialty: "Radiology",
          confidence: 88,
          estimated_value_usd: 1_850_000,
          summary: "Q4 2026 capital budget allocation for CT 5300 and ultrasound replacement.",
          source: "rural_rht",
          date_discovered: new Date().toISOString(),
        },
      ],
    });

    const stream = executeCopilotChat([
      { role: "user", content: "Show me high priority rural leads in Texas" },
    ]);

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of stream) {
      events.push(event);
    }

    const toolStart = events.find((e) => e.type === "tool_start");
    expect(toolStart).toBeDefined();
    expect(toolStart?.name).toBe("query_leads");

    const textEvent = events.find((e) => e.type === "text") as
      { type: "text"; text: string } | undefined;
    expect(textEvent).toBeDefined();
    expect(textEvent?.text).toContain("West Texas Rural Hospital");
    expect(textEvent?.text).toContain("Est. $1.9M");
    expect(textEvent?.text).toContain("Grounded directly in live Supabase sales intelligence");
  });

  it("executes deterministic physician lookup when user asks for decision-maker contacts", async () => {
    vi.stubEnv("GOOGLE_CLOUD_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("LOVABLE_API_KEY", "");

    vi.spyOn(copilotTools, "runCopilotTool").mockResolvedValue({
      count: 1,
      physicians: [
        {
          full_name: "Dr. Sarah Jenkins",
          credentials: "MD",
          title: "Chief of Radiology",
          primary_specialty: "Diagnostic Radiology",
          practice_city: "Little Rock",
          practice_state: "AR",
          email: "sjenkins@uams.edu",
          practice_phone: "(501) 686-5000",
        },
      ],
    });

    const stream = executeCopilotChat([
      { role: "user", content: "Find contacts and physicians in Arkansas" },
    ]);

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of stream) {
      events.push(event);
    }

    const toolStart = events.find((e) => e.type === "tool_start");
    expect(toolStart).toBeDefined();
    expect(toolStart?.name).toBe("query_physicians");

    const textEvent = events.find((e) => e.type === "text") as
      { type: "text"; text: string } | undefined;
    expect(textEvent?.text).toContain("Dr. Sarah Jenkins, MD");
    expect(textEvent?.text).toContain("sjenkins@uams.edu");
  });

  it("calls Google Cloud OpenAI-compatible endpoint when GOOGLE_CLOUD_API_KEY is configured", async () => {
    vi.stubEnv("GOOGLE_CLOUD_API_KEY", "test-gcp-api-key");
    vi.stubEnv("LOVABLE_API_KEY", "");

    let capturedUrl = "";
    let capturedAuth = "";
    let capturedBody = "";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      capturedUrl = typeof input === "string" ? input : String(input);
      capturedAuth = String(
        init?.headers ? (init.headers as Record<string, string>)["Authorization"] : "",
      );
      capturedBody = String(init?.body ?? "");

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "Top opportunities verified from Google Cloud Gemini Copilot.",
                tool_calls: null,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    const stream = executeCopilotChat([{ role: "user", content: "What are my top leads?" }]);

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(capturedUrl).toContain("generativelanguage.googleapis.com");
    expect(capturedAuth).toBe("Bearer test-gcp-api-key");
    expect(capturedBody).toContain("gemini-2.5-flash");

    const textEvent = events.find((e) => e.type === "text") as
      { type: "text"; text: string } | undefined;
    expect(textEvent?.text).toBe("Top opportunities verified from Google Cloud Gemini Copilot.");
  });

  it("gracefully falls back to local execution when Google Cloud API returns an upstream error", async () => {
    vi.stubEnv("GOOGLE_CLOUD_API_KEY", "test-gcp-api-key");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Quota Exceeded", { status: 429 }),
    );

    vi.spyOn(copilotTools, "runCopilotTool").mockResolvedValue({
      count: 1,
      leads: [
        {
          id: "lead-fallback-1",
          title: "Resilient Fallback Lead",
          confidence: 90,
          summary: "Live lead surfaced even during gateway outage.",
          source: "rural_rht",
          date_discovered: new Date().toISOString(),
        },
      ],
    });

    const stream = executeCopilotChat([{ role: "user", content: "Show me top leads" }]);

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of stream) {
      events.push(event);
    }

    // Must NOT crash or return a fatal error — must surface real data via fallback
    const textEvent = events.find((e) => e.type === "text") as
      { type: "text"; text: string } | undefined;
    expect(textEvent?.text).toContain("Resilient Fallback Lead");
  });

  it("handles multi-step tool calls and preserves Google thought_signature across turns", async () => {
    vi.stubEnv("GOOGLE_CLOUD_API_KEY", "test-gcp-api-key");

    let turn = 0;
    const capturedBodies: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      turn++;
      const bodyStr = String(init?.body ?? "");
      capturedBodies.push(bodyStr);

      if (turn === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  tool_calls: [
                    {
                      id: "call_abc123",
                      type: "function",
                      function: {
                        name: "query_leads",
                        arguments: JSON.stringify({ state: "TX" }),
                      },
                      extra_content: {
                        google: {
                          thought_signature: "sig_abc123_test",
                        },
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "Found 1 top Texas lead: Memorial Hermann Cath Lab Modernization ($1.7M).",
                tool_calls: null,
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });

    vi.spyOn(copilotTools, "runCopilotTool").mockResolvedValue({
      count: 1,
      leads: [{ id: "tx-1", title: "Memorial Hermann", state: "TX" }],
    });

    const stream = executeCopilotChat([
      { role: "user", content: "Show me Texas opportunities" },
    ]);

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    for await (const event of stream) {
      events.push(event);
    }

    expect(capturedBodies.length).toBe(2);
    // Verify second request contains the thought_signature in the assistant's previous tool_call
    expect(capturedBodies[1]).toContain("sig_abc123_test");
    expect(capturedBodies[1]).toContain("call_abc123");

    const textEvent = events.find((e) => e.type === "text") as
      { type: "text"; text: string } | undefined;
    expect(textEvent?.text).toContain("Found 1 top Texas lead");
  });
});
