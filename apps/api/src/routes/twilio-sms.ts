import {
  addMessage,
  currentSmsConversation,
  enqueueTurn,
  env,
  rateLimit,
  toE164,
  twiml,
} from "@relay/core";
import { getPrisma, Prisma } from "@relay/db";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { sendTwiml, verifyTwilio } from "../plugins/twilio-auth.js";
import { classifyKeyword, helpText, unknownNumberText } from "../sms/keywords.js";

const inbound = z.object({
  From: z.string(),
  Body: z.string().default(""),
  MessageSid: z.string(),
  NumMedia: z.coerce.number().int().default(0),
});

function respond(reply: FastifyReply, text?: string): FastifyReply {
  const res = new (twiml().MessagingResponse)();
  if (text) res.message(text);
  return sendTwiml(reply, res.toString());
}

export async function twilioSmsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Inbound SMS. Answers fast with empty TwiML and hands the turn to the worker, so agent work
   * never runs into Twilio's 15 second webhook timeout.
   */
  app.post("/twilio/sms", { preHandler: verifyTwilio }, async (req, reply) => {
    const { From, Body, MessageSid, NumMedia } = inbound.parse(req.body);
    const phone = toE164(From);
    if (!phone) return respond(reply);

    const prisma = getPrisma();
    const user = await prisma.user.findUnique({ where: { phone } });
    const keyword = classifyKeyword(Body);

    // Keywords are handled before anything reaches the agent.
    if (keyword === "stop") {
      if (user) {
        await prisma.user.update({ where: { id: user.id }, data: { smsOptOutAt: new Date() } });
      }
      return respond(reply); // Twilio sends the carrier-standard opt-out confirmation.
    }
    if (keyword === "start") {
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { smsOptOutAt: null, smsOptInAt: user.smsOptInAt ?? new Date() },
        });
      }
      return respond(reply);
    }
    if (keyword === "help") return respond(reply, helpText(env().SUPPORT_EMAIL));

    if (!user) {
      const first = await rateLimit(`unknown:${phone}`, 1, 24 * 60 * 60);
      return respond(reply, first.allowed ? unknownNumberText(env().PUBLIC_WEB_URL) : undefined);
    }
    if (user.smsOptOutAt) return respond(reply);

    const limit = await rateLimit(`sms:${user.id}`, 30, 10 * 60);
    if (!limit.allowed) {
      const warn = await rateLimit(`sms-warned:${user.id}`, 1, 10 * 60);
      return respond(
        reply,
        warn.allowed ? "Relay: that's a lot of messages at once. Give me a few minutes." : undefined,
      );
    }

    const conversation = await currentSmsConversation(user.id);
    const photoOnly = NumMedia > 0 && !Body.trim();
    let message;
    try {
      message = await addMessage({
        conversationId: conversation.id,
        direction: "INBOUND",
        role: "USER",
        content: photoOnly ? "[photo]" : Body,
        twilioSid: MessageSid,
        ...(NumMedia > 0 ? { metadata: { media: NumMedia } } : {}),
      });
    } catch (err) {
      // Twilio retried a webhook we already stored.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return respond(reply);
      }
      throw err;
    }

    if (photoOnly) {
      await prisma.message.update({ where: { id: message.id }, data: { handledAt: new Date() } });
      return respond(reply, "I can't open photos yet. Tell me in words what you need.");
    }

    await enqueueTurn({ userId: user.id, messageId: message.id }, MessageSid);
    return respond(reply);
  });
}
