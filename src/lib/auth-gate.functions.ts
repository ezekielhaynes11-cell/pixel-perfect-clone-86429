// Server functions for the password gate (verify password, log out, status).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  isGateEnabled,
  isUnlocked,
  setUnlockCookie,
  setClearUnlockCookie,
  verifyPassword,
} from "./auth-gate.server";

export const getGateStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { enabled: isGateEnabled(), unlocked: isUnlocked() };
});

export const unlockGate = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ password: z.string().min(1).max(200) }).parse(input))
  .handler(async ({ data }) => {
    if (!isGateEnabled()) return { ok: true, unlocked: true };
    if (!verifyPassword(data.password)) {
      return { ok: false, unlocked: false, error: "Incorrect password" };
    }
    setUnlockCookie(process.env.APP_PASSWORD!);
    return { ok: true, unlocked: true };
  });

export const lockGate = createServerFn({ method: "POST" }).handler(async () => {
  setClearUnlockCookie();
  return { ok: true };
});
