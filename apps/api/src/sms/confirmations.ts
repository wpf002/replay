import type { ConfirmationReply } from "@relay/agent";
import { checkPin, confirmActions, denyActions } from "@relay/core";
import type { Action, User } from "@relay/db";

/**
 * Applies a YES/NO reply to the person's pending actions. Returns the text to send back, or
 * null when the worker will text the results.
 */
export async function applySmsConfirmation(
  user: User,
  pending: Action[],
  reply: ConfirmationReply,
): Promise<string | null> {
  const ids = pending.map((a) => a.id);

  if (reply.kind === "no") {
    await denyActions(user.id, ids);
    return ids.length === 1 ? "Okay, skipped." : `Okay, skipped all ${ids.length}.`;
  }

  if (pending.some((a) => a.requiresPin)) {
    if (!reply.pin) return "Reply YES followed by your PIN to approve, or NO to skip.";
    const check = await checkPin(user, reply.pin);
    if (check === "locked") {
      return "Too many wrong PINs, so PIN approvals are paused for an hour. Reply NO to skip.";
    }
    if (check === "wrong") return "That PIN didn't match. Reply YES followed by your PIN, or NO to skip.";
  }

  const confirmed = await confirmActions(user.id, ids);
  if (!confirmed.length) return "That request expired. Ask me again if you still want it.";
  return null;
}
