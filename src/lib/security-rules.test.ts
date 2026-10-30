import { afterEach, describe, expect, it } from "vitest";
import { assertSafePublicUrl } from "./safe-url";
import { isAuthorizedCron } from "./cron-auth";
import { isUniqueViolation } from "./supabase-errors";
import { territoryToCode } from "./territory";

const req = (h: Record<string, string>) => new Request("https://x.test/api", { headers: h });

describe("cron auth", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });
  it("rejects every request when CRON_SECRET is unset", () => {
    expect(isAuthorizedCron(req({ "x-cron-secret": "anything" }))).toBe(false);
  });
  it("rejects a wrong secret", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedCron(req({ "x-cron-secret": "nope" }))).toBe(false);
  });
  it("accepts the right secret via Bearer", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorizedCron(req({ authorization: "Bearer s3cret-value" }))).toBe(true);
  });
});

describe("scraper URL guard", () => {
  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "file:///etc/passwd",
    "http://localhost:8080/",
    "http://[::1]/",
    "https://example.com:8443/",
  ])("rejects %s", (u) => {
    expect(() => assertSafePublicUrl(u)).toThrow();
  });
  it("allows a public https page", () => {
    expect(assertSafePublicUrl("https://www.memorialhermann.org/about").hostname).toBe(
      "www.memorialhermann.org",
    );
  });
});

describe("duplicate detection", () => {
  it("uses the 23505 code, not message text", () => {
    expect(isUniqueViolation({ code: "23505" } as never)).toBe(true);
    expect(isUniqueViolation({ code: "42P01", message: "duplicate" } as never)).toBe(false);
  });
});

describe("territory codes", () => {
  it("maps state names to the 2-letter code saved searches use", () => {
    expect(territoryToCode("texas")).toBe("TX");
    expect(territoryToCode("Oklahoma")).toBe("OK");
  });
});
