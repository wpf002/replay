import { getPrisma, type Conversation, type Message, type ModelId, type Prisma } from "@relay/db";
import { log } from "./log.js";
import { PERMANENT_SMS_ERRORS, sendSms, twilioErrorCode } from "./twilio.js";

/** An SMS thread rolls into a new Conversation after this much silence. */
const SMS_IDLE_MS = 12 * 60 * 60 * 1000;

export async function currentSmsConversation(userId: string): Promise<Conversation> {
  const prisma = getPrisma();
  const latest = await prisma.conversation.findFirst({
    where: { userId, channel: "SMS", endedAt: null },
    orderBy: { lastMessageAt: "desc" },
  });
  if (latest && Date.now() - latest.lastMessageAt.getTime() < SMS_IDLE_MS) return latest;
  if (latest) {
    await prisma.conversation.update({
      where: { id: latest.id },
      data: { endedAt: latest.lastMessageAt },
    });
  }
  return prisma.conversation.create({ data: { userId, channel: "SMS" } });
}

export interface NewMessage {
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  model?: ModelId | null;
  twilioSid?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function addMessage(m: NewMessage): Promise<Message> {
  const prisma = getPrisma();
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: m.conversationId,
        direction: m.direction,
        role: m.role,
        content: m.content,
        model: m.model ?? null,
        twilioSid: m.twilioSid ?? null,
        ...(m.metadata !== undefined ? { metadata: m.metadata } : {}),
      },
    }),
    prisma.conversation.update({
      where: { id: m.conversationId },
      data: { lastMessageAt: new Date() },
    }),
  ]);
  return message;
}

export interface TextTarget {
  id: string;
  phone: string;
  smsOptOutAt: Date | null;
}

/** SMS is limited to 1,600 characters per message by Twilio; stay under it. */
export const SMS_MAX = 1500;

export function clampSms(body: string): string {
  const text = body.trim();
  return text.length <= SMS_MAX ? text : `${text.slice(0, SMS_MAX - 1).trimEnd()}…`;
}

/**
 * Records an outbound assistant message, then sends it. The row is written first so a job
 * retry after a successful send can see the reply exists and won't text twice.
 */
export async function textUser(opts: {
  user: TextTarget;
  body: string;
  conversationId?: string;
  model?: ModelId | null;
  metadata?: Record<string, unknown>;
}): Promise<{ messageId: string; sent: boolean }> {
  const { user } = opts;
  const body = clampSms(opts.body);
  const conversationId = opts.conversationId ?? (await currentSmsConversation(user.id)).id;
  const message = await addMessage({
    conversationId,
    direction: "OUTBOUND",
    role: "ASSISTANT",
    content: body,
    model: opts.model ?? null,
    ...(opts.metadata ? { metadata: opts.metadata as Prisma.InputJsonValue } : {}),
  });

  if (user.smsOptOutAt) return { messageId: message.id, sent: false };

  const prisma = getPrisma();
  for (let attempt = 1; ; attempt++) {
    try {
      const sid = await sendSms(user.phone, body);
      await prisma.message.update({ where: { id: message.id }, data: { twilioSid: sid } });
      return { messageId: message.id, sent: true };
    } catch (err) {
      const code = twilioErrorCode(err);
      const permanent = code !== undefined && PERMANENT_SMS_ERRORS.has(code);
      if (!permanent && attempt < 3) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }
      log.error({ err, userId: user.id, code }, "sms send failed");
      await prisma.message.update({
        where: { id: message.id },
        data: {
          metadata: {
            ...(opts.metadata ?? {}),
            deliveryError: code ?? (err instanceof Error ? err.message : "unknown"),
          } as Prisma.InputJsonValue,
        },
      });
      if (code === 21610) {
        await prisma.user.update({ where: { id: user.id }, data: { smsOptOutAt: new Date() } });
      }
      return { messageId: message.id, sent: false };
    }
  }
}
