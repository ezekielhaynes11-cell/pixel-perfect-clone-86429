// Shared-password gate for the single-user app.
// Stored secret: APP_PASSWORD. If unset, the gate is disabled (open access).

import { createMiddleware, getRequestHeader, setResponseHeaders } from "@tanstack/react-start/server";

const COOKIE_NAME = "ya_unlock";

export function isGateEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

function readCookie(name: string): string | null {
  const header = getRequestHeader("cookie") ?? "";
  for (const part of header.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function isUnlocked(): boolean {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true; // gate disabled
  const cookie = readCookie(COOKIE_NAME);
  return !!cookie && cookie === hashToken(pw);
}

function hashToken(pw: string): string {
  // Lightweight derived token — enough to prevent trivial cookie forgery.
  // Not a security panacea; the real defense is keeping APP_PASSWORD secret.
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) >>> 0;
  return `v1.${h.toString(36)}.${pw.length}`;
}

export function unlockCookieHeader(pw: string): string {
  const token = hashToken(pw);
  // 30-day session, HttpOnly so JS can't read it, Secure on HTTPS, SameSite=Lax to allow nav.
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearUnlockCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function verifyPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true;
  if (input.length !== pw.length) return false;
  let diff = 0;
  for (let i = 0; i < pw.length; i++) diff |= input.charCodeAt(i) ^ pw.charCodeAt(i);
  return diff === 0;
}

// Middleware used by all protected server functions.
export const requireUnlock = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (!isUnlocked()) {
    throw new Response("Locked", { status: 401 });
  }
  return next();
});

export function setUnlockCookie(pw: string) {
  setResponseHeaders(new Headers({ "Set-Cookie": unlockCookieHeader(pw) }));
}

export function setClearUnlockCookie() {
  setResponseHeaders(new Headers({ "Set-Cookie": clearUnlockCookieHeader() }));
}
