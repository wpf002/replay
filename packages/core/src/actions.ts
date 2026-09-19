import { getPrisma, type Action } from "@relay/db";
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

export async function denyActions(userId: string, actionIds: string[]): Promise<number> {
  const { count } = await getPrisma().action.updateMany({
    where: { id: { in: actionIds }, userId, status: "AWAITING_CONFIRMATION" },
    data: { status: "DENIED" },
  });
  return count;
}
