import { getPrisma, type Prisma } from "@relay/db";
import type { ApprovalRequest, PendingApproval } from "./loop.js";

const EXPIRY_MS = { SMS: 30 * 60_000, VOICE: 10 * 60_000 } as const;

/**
 * Builds the loop's requestApproval callback. Each request becomes an Action awaiting
 * confirmation. The first request in a turn expires older unanswered ones, so a YES only ever
 * approves what the user was shown most recently.
 */
export function approvalGate(opts: {
  userId: string;
  channel: "SMS" | "VOICE";
  conversationId: string;
  pinSet: boolean;
}): (req: ApprovalRequest) => Promise<PendingApproval> {
  let first = true;
  return async (req) => {
    const prisma = getPrisma();
    if (first) {
      first = false;
      await prisma.action.updateMany({
        where: { userId: opts.userId, status: "AWAITING_CONFIRMATION" },
        data: { status: "EXPIRED", error: "Replaced by a newer request" },
      });
    }
    // Caller ID can be spoofed, so on calls every approval needs the PIN. Over SMS only high-risk
    // actions do. Without a PIN set, approval falls back to a YES by text.
    const requiresPin = opts.pinSet && (opts.channel === "VOICE" || req.risk === "HIGH");
    const action = await prisma.action.create({
      data: {
        userId: opts.userId,
        type: req.tool.name,
        status: "AWAITING_CONFIRMATION",
        summary: req.summary,
        payload: req.input as Prisma.InputJsonValue,
        risk: req.risk,
        requiresConfirmation: true,
        requiresPin,
        tainted: req.tainted,
        channel: opts.channel,
        conversationId: opts.conversationId,
        expiresAt: new Date(Date.now() + EXPIRY_MS[opts.channel]),
      },
    });
    return { actionId: action.id, summary: action.summary, risk: req.risk, requiresPin };
  };
}

/** Actions still waiting on this user. Expired ones are marked on the way. */
export async function pendingActions(userId: string) {
  const prisma = getPrisma();
  await prisma.action.updateMany({
    where: { userId, status: "AWAITING_CONFIRMATION", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return prisma.action.findMany({
    where: { userId, status: "AWAITING_CONFIRMATION" },
    orderBy: { createdAt: "asc" },
  });
}
