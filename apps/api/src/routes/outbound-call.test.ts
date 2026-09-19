import { closeQueues, closeRedis } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance } from "fastify";
import twilio from "twilio";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { hasDb, makeUser, resetState, signedTwilioRequest } from "../test/helpers.js";

describe.skipIf(!hasDb)("outbound calls", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  beforeEach(resetState);
  afterAll(async () => {
    await app.close();
    await closeQueues();
    await closeRedis();
    await getPrisma().$disconnect();
  });

  async function runningCall(callSid: string) {
    const user = await makeUser({ name: "Will" });
    const action = await getPrisma().action.create({
      data: {
        userId: user.id,
        type: "place_call",
        status: "RUNNING",
        summary: "Call Luigi's",
        payload: { businessName: "Luigi's", phoneNumber: "+15125550123", goal: "Book a table for 2", shareCallbackNumber: true },
        risk: "HIGH",
      },
    });
    const conversation = await getPrisma().conversation.create({
      data: { userId: user.id, channel: "VOICE", direction: "OUTBOUND", actionId: action.id, callSid },
    });
    return { user, action, conversation };
  }

  const lastText = async (userId: string) =>
    (await getPrisma().message.findFirst({
      where: { conversation: { userId, channel: "SMS" }, direction: "OUTBOUND" },
      orderBy: { createdAt: "desc" },
    }))?.content;

  it("reports calls nobody answered", async () => {
    const { user, action } = await runningCall("CAbusy");
    const res = await app.inject(
      signedTwilioRequest("/twilio/call-status", { CallSid: "CAbusy", CallStatus: "no-answer" }),
    );
    expect(res.statusCode).toBe(204);
    expect((await getPrisma().action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("FAILED");
    expect(await lastText(user.id)).toBe("Luigi's: nobody picked up. Want me to try again later?");

    // A second callback for the same call doesn't text again.
    await app.inject(signedTwilioRequest("/twilio/call-status", { CallSid: "CAbusy", CallStatus: "completed" }));
    expect(await getPrisma().message.count({ where: { direction: "OUTBOUND" } })).toBe(1);
  });

  it("settles the action when the business hangs up mid-call", async () => {
    const { user, action, conversation } = await runningCall("CAhangup");
    const signature = twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, "wss://api.relay.test/voice/ws", {});
    const ws = await app.injectWS("/voice/ws", { headers: { "x-twilio-signature": signature } });
    ws.send(
      JSON.stringify({
        type: "setup",
        callSid: "CAhangup",
        customParameters: { mode: "outbound", conversationId: conversation.id },
      }),
    );
    await new Promise((r) => setTimeout(r, 200));
    ws.terminate();
    await new Promise((r) => setTimeout(r, 500));

    expect((await getPrisma().action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("FAILED");
    expect(await lastText(user.id)).toBe("Luigi's: the call ended before anything was settled.");
  });
});
