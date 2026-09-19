import { closeQueues, closeRedis, getQueue, QUEUE } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { hasDb, makeUser, resetState, signedTwilioRequest } from "../test/helpers.js";

describe.skipIf(!hasDb)("POST /twilio/sms", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  beforeEach(resetState);
  afterAll(async () => {
    await app.close();
    await getQueue(QUEUE.turns).obliterate({ force: true });
    await closeQueues();
    await closeRedis();
    await getPrisma().$disconnect();
  });

  const sms = (from: string, body: string, sid = `SM${Math.random().toString(16).slice(2)}`) =>
    signedTwilioRequest("/twilio/sms", { From: from, To: "+15555550100", Body: body, MessageSid: sid, NumMedia: "0" });

  it("rejects requests without a valid signature", async () => {
    const req = sms("+15125550100", "hi");
    const res = await app.inject({ ...req, headers: { ...req.headers, "x-twilio-signature": "forged" } });
    expect(res.statusCode).toBe(403);

    const unsigned = await app.inject({ ...req, headers: { "content-type": req.headers["content-type"] } });
    expect(unsigned.statusCode).toBe(403);
  });

  it("rejects a signature over different params", async () => {
    const req = sms("+15125550100", "hi");
    const res = await app.inject({ ...req, payload: req.payload.replace("Body=hi", "Body=bye") });
    expect(res.statusCode).toBe(403);
  });

  it("records STOP as an opt-out without replying", async () => {
    const user = await makeUser();
    const res = await app.inject(sms(user.phone, " stop "));
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>');
    const after = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.smsOptOutAt).toBeInstanceOf(Date);
  });

  it("clears the opt-out on START", async () => {
    const user = await makeUser({ smsOptOutAt: new Date() });
    await app.inject(sms(user.phone, "START"));
    const after = await getPrisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.smsOptOutAt).toBeNull();
  });

  it("answers HELP with program info", async () => {
    const user = await makeUser();
    const res = await app.inject(sms(user.phone, "help"));
    expect(res.body).toContain("help@relay.test");
    expect(res.body).toContain("Reply STOP to cancel");
  });

  it("tells unknown numbers how to sign up, once a day", async () => {
    const first = await app.inject(sms("+15125559999", "hello?"));
    expect(first.body).toContain("https://relay.test");
    const second = await app.inject(sms("+15125559999", "hello??"));
    expect(second.body).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>');
  });

  it("stores the message and queues an agent turn", async () => {
    const user = await makeUser();
    const res = await app.inject(sms(user.phone, "what's on my calendar", "SMtest123"));
    expect(res.statusCode).toBe(200);

    const message = await getPrisma().message.findUniqueOrThrow({ where: { twilioSid: "SMtest123" } });
    expect(message).toMatchObject({ direction: "INBOUND", role: "USER", content: "what's on my calendar" });
    const job = await getQueue(QUEUE.turns).getJob("SMtest123");
    expect(job?.data).toEqual({ userId: user.id, messageId: message.id });
  });

  it("ignores Twilio retries of the same message", async () => {
    const user = await makeUser();
    await app.inject(sms(user.phone, "hi", "SMdupe"));
    const retry = await app.inject(sms(user.phone, "hi", "SMdupe"));
    expect(retry.statusCode).toBe(200);
    expect(await getPrisma().message.count({ where: { twilioSid: "SMdupe" } })).toBe(1);
  });

  it("drops messages from opted-out users", async () => {
    const user = await makeUser({ smsOptOutAt: new Date() });
    await app.inject(sms(user.phone, "hello", "SMoptedout"));
    expect(await getPrisma().message.count({ where: { twilioSid: "SMoptedout" } })).toBe(0);
  });
});
