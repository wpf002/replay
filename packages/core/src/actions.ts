import { getPrisma, type Action, type Prisma } from "@relay/db";
import { textUser } from "./conversations.js";
import { enqueueAction } from "./queues.js";

/**
 * Moves the user's matching AWAITING_CONFIRMATION actions to CONFIRMED and queues them.
 * Each row flips with a conditional update, so a double tap or a YES racing an app approval
 * can't run an action twice. Returns only the actions this call confirmed.
 */
export async function confirmActions(userId: string, actionIds: string[]): Promise<Action[]> {
  const prisma = getPrisma();
  const confirmed: Action[] = [];
  for (const id of actionIds) {
    const { count } = await prisma.action.updateMany({
      where: { id, userId, status: "AWAITING_CONFIRMATION", expiresAt: { gt: new Date() } },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    if (count === 1) {
      confirmed.push(await prisma.action.findUniqueOrThrow({ where: { id } }));
      await enqueueAction(id);
    }
  }
  return confirmed;
}

/**
 * Settles a RUNNING action that finished on its own (a business call) and texts the user the
 * result. Only the first caller wins, so the call session and Twilio's status callback can't
 * both report it.
 */
export async function settleRunningAction(
  actionId: string,
  result: { ok: boolean; message: string; data?: Record<string, unknown> },
): Promise<boolean> {
  const prisma = getPrisma();
  const { count } = await prisma.action.updateMany({
    where: { id: actionId, status: "RUNNING" },
    data: {
      status: result.ok ? "SUCCEEDED" : "FAILED",
      result: { message: result.message, ...(result.data ?? {}) } as Prisma.InputJsonValue,
      completedAt: new Date(),
      ...(result.ok ? {} : { error: result.message }),
    },
  });
  if (count !== 1) return false;
  const action = await prisma.action.findUniqueOrThrow({ where: { id: actionId }, include: { user: true } });
  await textUser({ user: action.user, body: result.message, metadata: { kind: "call-result", actionId } });
  return true;
}

export async function denyActions(userId: string, actionIds: string[]): Promise<number> {
  const { count } = await getPrisma().action.updateMany({
    where: { id: { in: actionIds }, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "DENIED" },
  });
  return count;
}
