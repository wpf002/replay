import { closeQueues, closeRedis, hashPin, saveModelKey } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { FastifyInstance } from "fastify";
import twilio from "twilio";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { buildApp } from "../app.js";
import { hasDb, makeUser, resetState, signedTwilioRequest } from "../test/helpers.js";
import { spokenDigits } from "../voice/relay.js";

describe("spokenDigits", () => {
  it.each([
    ["one two three four", "1234"],
    ["it's 4 8 2 1", "4821"],
    ["2468", "2468"],
    ["oh five five nine", "0559"],
  ])("reads %s", (speech, digits) => {
    expect(spokenDigits(speech)).toBe(digits);
  });
});

describe.skipIf(!hasDb)("voice", () => {
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

  const call = (from: string, extra: Record<string, string> = {}) =>
    signedTwilioRequest("/twilio/voice", { From: from, To: "+15555550100", CallSid: `CA${Math.random().toString(16).slice(2)}`, ...extra });

  it("tells unknown callers how to sign up and hangs up", async () => {
    const res = await app.inject(call("+15125559990"));
    expect(res.body).toContain("<Say>This number isn't signed up for Relay yet.");
    expect(res.body).toContain("<Hangup/>");
  });

  it("connects known callers to ConversationRelay", async () => {
    const user = await makeUser({ name: "Will Foti" });
    const res = await app.inject(call(user.phone, { StirVerstat: "TN-Validation-Passed-A" }));
    expect(res.body).toContain('<ConversationRelay url="wss://api.relay.test/voice/ws"');
    expect(res.body).toContain('welcomeGreeting="Hi Will, it\'s Relay."');
    expect(res.body).toContain('<Parameter name="verified" value="1"/>');
    const convo = await getPrisma().conversation.findFirstOrThrow({ where: { userId: user.id } });
    expect(res.body).toContain(`<Parameter name="conversationId" value="${convo.id}"/>`);
    expect(convo).toMatchObject({ channel: "VOICE", direction: "INBOUND" });
  });

  it("asks callers to connect their AI when Relay doesn't include it", async () => {
    const user = await makeUser({ defaultModel: "GPT" });
    const res = await app.inject(call(user.phone));
    expect(res.body).toContain("<Say>ChatGPT isn't connected yet. Open the Relay app and connect it under AI accounts.</Say>");
    expect(res.body).toContain("<Hangup/>");

    await saveModelKey(user.id, "gpt", "sk-proj-own-key-abcdefghijklmnop");
    expect((await app.inject(call(user.phone))).body).toContain("<ConversationRelay");
  });

  it("treats calls without A attestation as unverified", async () => {
    const user = await makeUser();
    const res = await app.inject(call(user.phone, { StirVerstat: "TN-Validation-Passed-B" }));
    expect(res.body).toContain('<Parameter name="verified" value="0"/>');
  });

  const relaySignature = () =>
    twilio.getExpectedTwilioSignature(process.env.TWILIO_AUTH_TOKEN!, "wss://api.relay.test/voice/ws", {});

  it("refuses relay connections that Twilio didn't sign", async () => {
    await expect(app.injectWS("/voice/ws", { headers: { "x-twilio-signature": "forged" } })).rejects.toThrow(/403/);
  });

  function nextText(ws: WebSocket, match: RegExp): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no message matching ${match}`)), 5000);
      ws.on("message", (data) => {
        const msg = JSON.parse(data.toString()) as { type: string; token?: string };
        if (msg.type === "text" && msg.token && match.test(msg.token)) {
          clearTimeout(timer);
          resolve(msg.token);
        }
      });
    });
  }

  it("unlocks an unverified call with the keypad PIN", async () => {
    const user = await makeUser({ pinHash: await hashPin("2468") });
    const convo = await getPrisma().conversation.create({
      data: { userId: user.id, channel: "VOICE", callSid: "CAunlock" },
    });
    const ws = await app.injectWS("/voice/ws", { headers: { "x-twilio-signature": relaySignature() } });
    ws.send(JSON.stringify({ type: "setup", callSid: "CAunlock", customParameters: { conversationId: convo.id, verified: "0" } }));
    await new Promise((r) => setTimeout(r, 200));

    const wrong = nextText(ws, /didn't match/);
    for (const d of ["1", "1", "1", "1", "#"]) ws.send(JSON.stringify({ type: "dtmf", digit: d }));
    await wrong;

    const ok = nextText(ws, /verified/);
    for (const d of ["2", "4", "6", "8", "#"]) ws.send(JSON.stringify({ type: "dtmf", digit: d }));
    await ok;
    ws.terminate();
  });

  it("ends sessions whose setup doesn't match a call", async () => {
    const ws = await app.injectWS("/voice/ws", { headers: { "x-twilio-signature": relaySignature() } });
    const ended = new Promise<boolean>((resolve) => {
      ws.on("message", (data) => resolve(JSON.parse(data.toString()).type === "end"));
    });
    ws.send(JSON.stringify({ type: "setup", callSid: "CAnope", customParameters: { conversationId: "x" } }));
    expect(await ended).toBe(true);
    ws.terminate();
  });
});
