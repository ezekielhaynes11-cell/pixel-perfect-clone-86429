// Gmail send via the Lovable connector gateway.
// Connector must be linked: standard_connectors--connect with connector_id "google_mail"

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail";

export interface GmailSendInput {
  to: string;
  subject: string;
  body: string;
  cc?: string;
}

export interface GmailSendResult {
  ok: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
}

export async function sendGmail(input: GmailSendInput): Promise<GmailSendResult> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const GMAIL_API_KEY = process.env.GOOGLE_MAIL_API_KEY;
  if (!LOVABLE_API_KEY) return { ok: false, error: "LOVABLE_API_KEY not set" };
  if (!GMAIL_API_KEY) {
    return {
      ok: false,
      error:
        "Gmail is not connected yet. Open the chat and ask Lovable to connect the Gmail connector, then retry.",
    };
  }

  // Build a basic RFC 822 message
  const rfc822 = [
    `To: ${input.to}`,
    input.cc ? `Cc: ${input.cc}` : "",
    `Subject: ${encodeRfcHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ]
    .filter(Boolean)
    .join("\r\n");

  // Gmail expects URL-safe base64
  const raw = base64Url(rfc822);

  const res = await fetch(`${GATEWAY_URL}/gmail/v1/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GMAIL_API_KEY,
    },
    body: JSON.stringify({ raw }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Gmail send failed [${res.status}]: ${text.slice(0, 300)}` };
  }
  const data = (await res.json()) as { id?: string; threadId?: string };
  return { ok: true, messageId: data.id, threadId: data.threadId };
}

function base64Url(s: string): string {
  // Cloudflare Workers have btoa; encode as Latin1 first to avoid UTF-8 issues.
  const utf8 = unescape(encodeURIComponent(s));
  const b64 =
    typeof btoa === "function" ? btoa(utf8) : Buffer.from(utf8, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeRfcHeader(s: string): string {
  // Quote non-ASCII subjects per RFC 2047
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(s)))
      : Buffer.from(s, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}
