import { placeCall } from "@relay/agent";
import {
  conversationRelayTwiml,
  env,
  fromDbModel,
  loadKeyRing,
  noAccessMessage,
  rateLimit,
  relayUrl,
  settleRunningAction,
  toE164,
  twiml,
  validTwilioSignature,
} from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendTwiml, verifyTwilio } from "../plugins/twilio-auth.js";
import { InboundCall } from "../voice/inbound-call.js";
import { OutboundCall } from "../voice/outbound-call.js";
import { parseRelayMessage, RelaySocket } from "../voice/relay.js";

const incoming = z.object({
  From: z.string(),
  CallSid: z.string(),
  // STIR/SHAKEN result for the caller ID, when the originating carrier signed the call.
  StirVerstat: z.string().optional(),
});

function sayAndHangUp(reply: FastifyReply, line: string): FastifyReply {
  const res = new (twiml().VoiceResponse)();
  res.say(line);
  res.hangup();
  return sendTwiml(reply, res.toString());
}

async function verifyRelayUpgrade(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const signature = req.headers["x-twilio-signature"];
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  if (typeof signature !== "string" || !validTwilioSignature(signature, relayUrl() + query, {})) {
    req.log.warn("rejected ConversationRelay connection with a missing or invalid signature");
    await reply.code(403).send({ error: "Invalid Twilio signature" });
  }
}

export async function twilioVoiceRoutes(app: FastifyInstance): Promise<void> {
  /** Inbound call. Known callers are connected to ConversationRelay; everyone else hears a line. */
  app.post("/twilio/voice", { preHandler: verifyTwilio }, async (req, reply) => {
    const { From, CallSid, StirVerstat } = incoming.parse(req.body);
    const phone = toE164(From);
    const user = phone ? await getPrisma().user.findUnique({ where: { phone } }) : null;
    if (!user) {
      return sayAndHangUp(reply, `This number isn't signed up for Relay yet. You can request an invite at ${new URL(env().PUBLIC_WEB_URL).host}.`);
    }

    const calls = await rateLimit(`calls:${user.id}`, 12, 60 * 60);
    if (!calls.allowed) return sayAndHangUp(reply, "You've made a lot of calls this hour. Try again a bit later.");
    const defaultModel = fromDbModel(user.defaultModel);
    const access = (await loadKeyRing(user.id, user.timezone)).credential(defaultModel);
    if (access.source === "none") {
      return sayAndHangUp(reply, noAccessMessage(defaultModel, access.reason, { voice: true }));
    }

    const conversation = await getPrisma().conversation.upsert({
      where: { callSid: CallSid },
      create: { userId: user.id, channel: "VOICE", direction: "INBOUND", callSid: CallSid },
      update: {},
    });
    const greeting = user.name ? `Hi ${user.name.split(" ")[0]}, it's Relay.` : "Hi, it's Relay.";
    return sendTwiml(
      reply,
      conversationRelayTwiml({
        greeting,
        parameters: {
          mode: "inbound",
          conversationId: conversation.id,
          verified: StirVerstat?.startsWith("TN-Validation-Passed-A") ? "1" : "0",
          greeting,
        },
      }),
    );
  });

  /** <Connect action>: the ConversationRelay session ended. */
  app.post("/twilio/voice/done", { preHandler: verifyTwilio }, async (req, reply) => {
    const { CallSid } = z.object({ CallSid: z.string() }).parse(req.body);
    await getPrisma().conversation.updateMany({
      where: { callSid: CallSid, endedAt: null },
      data: { endedAt: new Date() },
    });
    const res = new (twiml().VoiceResponse)();
    res.hangup();
    return sendTwiml(reply, res.toString());
  });

  /**
   * Status of calls Relay places. Covers calls that never connected (busy, no answer), where no
   * relay session exists to report back.
   */
  app.post("/twilio/call-status", { preHandler: verifyTwilio }, async (req, reply) => {
    const { CallSid, CallStatus } = z
      .object({ CallSid: z.string(), CallStatus: z.string() })
      .parse(req.body);
    const conversation = await getPrisma().conversation.findUnique({
      where: { callSid: CallSid },
      include: { action: true, _count: { select: { messages: true } } },
    });
    const action = conversation?.action;
    if (conversation && action) {
      const brief = placeCall.input.safeParse(action.payload);
      const name = brief.success ? brief.data.businessName : "The business";
      const missed: Record<string, string> = {
        busy: "the line was busy",
        "no-answer": "nobody picked up",
        failed: "the call couldn't go through",
        canceled: "the call was canceled",
      };
      if (missed[CallStatus]) {
        await getPrisma().conversation.update({ where: { id: conversation.id }, data: { endedAt: new Date() } });
        await settleRunningAction(action.id, { ok: false, message: `${name}: ${missed[CallStatus]}. Want me to try again later?` });
      } else if (CallStatus === "completed" && conversation._count.messages === 0) {
        await settleRunningAction(action.id, { ok: false, message: `${name}: the call connected but ended before anyone spoke.` });
      }
    }
    return reply.code(204).send();
  });

  app.get("/voice/ws", { websocket: true, preValidation: verifyRelayUpgrade }, (socket, req) => {
    const relay = new RelaySocket(socket);
    let call: InboundCall | OutboundCall | null = null;

    socket.on("message", async (data) => {
      const message = parseRelayMessage(data.toString());
      if (!message) return;
      try {
        if (message.type === "setup") {
          const session =
            message.customParameters?.mode === "outbound"
              ? new OutboundCall(relay, req.log)
              : new InboundCall(relay, req.log);
          if (await session.start(message)) {
            call = session;
          } else {
            req.log.warn({ callSid: message.callSid }, "ConversationRelay setup for unknown call");
            relay.end({ reason: "unknown_call" });
          }
          return;
        }
        if (!call) return;
        if (message.type === "prompt") call.onPrompt(message.voicePrompt);
        else if (message.type === "interrupt") call.onInterrupt();
        else if (message.type === "dtmf") call.onDigit(message.digit);
        else if (message.type === "error") req.log.error({ description: message.description }, "ConversationRelay error");
      } catch (err) {
        req.log.error({ err }, "voice message handling failed");
      }
    });

    socket.on("close", () => {
      call?.close().catch((err: unknown) => req.log.error({ err }, "voice close failed"));
    });
  });
}
