import { getPrisma, type User } from "@relay/db";
import { verifyPinHash } from "./crypto.js";

/** Failed attempts before the PIN locks. */
export const PIN_MAX_FAILURES = 5;
const LOCK_MS = 60 * 60_000;

export type PinCheck = "ok" | "wrong" | "locked" | "not_set";

/**
 * Checks a PIN and tracks failures across every channel, so guesses by text, by phone, and in
 * the app all count toward the same lockout.
 */
export async function checkPin(user: Pick<User, "id" | "pinHash" | "pinFailures" | "pinLockedUntil">, pin: string): Promise<PinCheck> {
  if (!user.pinHash) return "not_set";
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) return "locked";

  const prisma = getPrisma();
  if (await verifyPinHash(pin, user.pinHash)) {
    if (user.pinFailures > 0 || user.pinLockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pinFailures: 0, pinLockedUntil: null },
      });
    }
    return "ok";
  }

  const failures = user.pinFailures + 1;
  const locked = failures >= PIN_MAX_FAILURES;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      pinFailures: locked ? 0 : failures,
      pinLockedUntil: locked ? new Date(Date.now() + LOCK_MS) : null,
    },
  });
  return locked ? "locked" : "wrong";
}
