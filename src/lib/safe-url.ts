// SSRF guard for user-supplied URLs fetched server-side. Allows only public
// http(s) hosts on default ports; rejects IP literals in private/loopback/
// link-local/metadata ranges and internal hostnames. (DNS rebinding to a private
// IP is not detectable on Workers; outbound fetch there cannot reach the
// Worker's own network, which limits impact.)

function isPrivateIPv4(h: string): boolean {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

export function assertSafePublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed");
  }
  if (u.username || u.password) throw new Error("URLs with credentials are not allowed");
  if (u.port && u.port !== "80" && u.port !== "443")
    throw new Error("Non-standard ports are not allowed");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (!host.includes(".") && !host.includes(":"))
  ) {
    throw new Error("Internal hosts are not allowed");
  }
  if (isPrivateIPv4(host)) throw new Error("Private IP addresses are not allowed");
  if (host.includes(":")) {
    // Any IPv6 literal: block loopback, link-local, unique-local, mapped v4.
    if (
      host === "::1" ||
      host === "::" ||
      /^(fe8|fe9|fea|feb|fc|fd)/.test(host) ||
      host.startsWith("::ffff:")
    ) {
      throw new Error("Private IP addresses are not allowed");
    }
  }
  return u;
}

export const MAX_SCRAPE_BYTES = 2_000_000;

export async function readCapped(res: Response, max = MAX_SCRAPE_BYTES): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error("Page is too large to scrape (over 2 MB)");
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
