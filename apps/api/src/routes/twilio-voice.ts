import {
  dailySpend,
  env,
  publicApiUrl,
  rateLimit,
  toE164,
  twiml,
  validTwilioSignature,
} from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { sendTwiml, verifyTwilio } from "../plugins/twilio-auth.js";
import { InboundCall } from "../voice/inbound-call.js";
import { parseRelayMessage, RelaySocket } from "../voice/relay.js";

const incoming = z.object({
  From: z.string(),
  CallSid: z.string(),
  // STIR/SHAKEN result for the caller ID, when the originating carrier signed the call.
  StirVerstat: z.string().optional(),
});

/** wss:// URL Twilio connects to. Twilio signs the upgrade request with this exact URL. */
export function relayUrl(): string {
  return publicApiUrl("/voice/ws").replace(/^http/, "ws");
}

export function conversationRelay(
  res: InstanceType<ReturnType<typeof twiml>["VoiceResponse"]>,
  opts: { greeting?: string; parameters: Record<string, string> },
): void {
  const e = env();
  const connect = res.connect({ action: publicApiUrl("/twilio/voice/done") });
  const relay = connect.conversationRelay({
    url: relayUrl(),
    ...(opts.greeting ? { welcomeGreeting: opts.greeting, welcomeGreetingInterruptible: "any" } : {}),
    interruptible: "any",
    dtmfDetection: true,
    language: "en-US",
    hints: "Relay, Claude, GPT, ChatGPT, Perplexity",
    ...(e.VOICE_TTS_PROVIDER ? { ttsProvider: e.VOICE_TTS_PROVIDER } : {}),
    ...(e.VOICE_NAME ? { voice: e.VOICE_NAME } : {}),
  });
  for (const [name, value] of Object.entries(opts.parameters)) relay.parameter({ name, value });
}

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
    if ((await dailySpend(user.id, user.timezone)).over) {
      return sayAndHangUp(reply, "You've reached today's usage limit. It resets at midnight.");
    }

    const conversation = await getPrisma().conversation.upsert({
      where: { callSid: CallSid },
      create: { userId: user.id, channel: "VOICE", direction: "INBOUND", callSid: CallSid },
      update: {},
    });
    const greeting = user.name ? `Hi ${user.name.split(" ")[0]}, it's Relay.` : "Hi, it's Relay.";
    const res = new (twiml().VoiceResponse)();
    conversationRelay(res, {
      greeting,
      parameters: {
        conversationId: conversation.id,
        verified: StirVerstat?.startsWith("TN-Validation-Passed-A") ? "1" : "0",
        greeting,
      },
    });
    return sendTwiml(reply, res.toString());
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

  app.get("/voice/ws", { websocket: true, preValidation: verifyRelayUpgrade }, (socket, req) => {
    const relay = new RelaySocket(socket);
    let call: InboundCall | null = null;

    socket.on("message", async (data) => {
      const message = parseRelayMessage(data.toString());
      if (!message) return;
      try {
        if (message.type === "setup") {
          const session = new InboundCall(relay, req.log);
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
