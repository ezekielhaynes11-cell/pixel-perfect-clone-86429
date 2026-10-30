import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { sendGmail } from "./integrations/gmail.server";
import { pushLeadToHubspot } from "./integrations/hubspot.server";
import { resolveSafeDashboardRedirect } from "./redirect-guard";

describe("zero-login dashboard invariants", () => {
  it("keeps every server function module free of login middleware gates", () => {
    const libDir = join(process.cwd(), "src", "lib");
    const functionFiles = readdirSync(libDir).filter((file) => file.endsWith(".functions.ts"));
    expect(functionFiles.length).toBeGreaterThanOrEqual(7);

    for (const file of functionFiles) {
      const source = readFileSync(join(libDir, file), "utf-8");
      expect(source, `${file} must not gate on requireRep`).not.toContain("requireRep");
      expect(source, `${file} must not gate on requireSupabaseAuth`).not.toContain(
        "requireSupabaseAuth",
      );
    }
  });

  it("normalizes legacy /auth redirects safely to internal dashboard routes", () => {
    expect(resolveSafeDashboardRedirect(undefined)).toBe("/");
    expect(resolveSafeDashboardRedirect("")).toBe("/");
    expect(resolveSafeDashboardRedirect("/pipeline")).toBe("/pipeline");
    expect(resolveSafeDashboardRedirect("/settings/keywords")).toBe("/settings/keywords");
    expect(resolveSafeDashboardRedirect("/auth?redirect=/")).toBe("/");
    expect(resolveSafeDashboardRedirect("https://evil.example/phish")).toBe("/");
    expect(resolveSafeDashboardRedirect("//evil.example/phish")).toBe("/");
  });
});

describe("Gmail and HubSpot connector boundary resilience", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fails gracefully when Gmail connector credentials are absent", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("GOOGLE_MAIL_API_KEY", "");
    const outcome = await sendGmail({
      to: "director@hospital.org",
      subject: "Philips POCUS follow-up",
      body: "Checking in on your department evaluation.",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("LOVABLE_API_KEY");
  });

  it("handles Gmail gateway network failures without unhandled rejections", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-lovable-key");
    vi.stubEnv("GOOGLE_MAIL_API_KEY", "test-gmail-key");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("gateway timeout"));

    const outcome = await sendGmail({
      to: "director@hospital.org",
      subject: "Philips POCUS follow-up",
      body: "Checking in on your department evaluation.",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("gateway timeout");
  });

  it("handles HubSpot gateway upstream 502 responses cleanly", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-lovable-key");
    vi.stubEnv("HUBSPOT_API_KEY", "test-hubspot-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Bad Gateway", { status: 502 }),
    );

    const outcome = await pushLeadToHubspot({
      title: "Memorial Hermann POCUS Expansion",
      summary: "Emergency ultrasound fleet upgrade",
      hospital: "Memorial Hermann",
      estimated_value_usd: 180000,
      win_probability: 0.5,
      confidence: 88,
      source: "sam_gov",
      source_url: "https://sam.gov/opp/example",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("502");
  });
});
