import { closeQueues, closeRedis, getQueue, hashPin, QUEUE } from "@relay/core";
import { getPrisma } from "@relay/db";
import type { AuthSession, AuthVerifyResult, MeDTO } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { signSession } from "../../auth/tokens.js";
import { hasDb, makeUser, resetState, signedTwilioRequest } from "../../test/helpers.js";

describe.skipIf(!hasDb)("/v1", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  beforeEach(resetState);
  afterAll(async () => {
    await app.close();
    await getQueue(QUEUE.actions).obliterate({ force: true });
    await closeQueues();
    await closeRedis();
    await getPrisma().$disconnect();
  });

  const post = (url: string, payload: unknown, token?: string) =>
    app.inject({
      method: "POST",
      url,
      payload: payload as Record<string, unknown>,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  describe("auth", () => {
    it("signs up a new number with an invite code and consent", async () => {
      await getPrisma().invite.create({ data: { code: "FRIENDS", maxUses: 1 } });

      expect((await post("/v1/auth/start", { phone: "(512) 555-0199" })).statusCode).toBe(200);
      const bad = await post("/v1/auth/verify", { phone: "5125550199", code: "000000" });
      expect(bad.statusCode).toBe(400);

      const verify = (await post("/v1/auth/verify", { phone: "5125550199", code: "424242" })).json<AuthVerifyResult>();
      expect(verify).toMatchObject({ status: "needs_signup", inviteRequired: true });
      if (verify.status !== "needs_signup") throw new Error("expected signup");

      const noConsent = await post("/v1/auth/signup", {
        signupToken: verify.signupToken,
        name: "Will",
        inviteCode: "friends",
        smsConsent: false,
      });
      expect(noConsent.statusCode).toBe(400);

      const res = await post("/v1/auth/signup", {
        signupToken: verify.signupToken,
        name: "Will",
        timezone: "America/New_York",
        inviteCode: "friends",
        smsConsent: true,
      });
      expect(res.statusCode).toBe(200);
      const session = res.json<AuthSession>();
      expect(session.me).toMatchObject({ phone: "+15125550199", name: "Will", timezone: "America/New_York", defaultModel: "claude" });

      const user = await getPrisma().user.findUniqueOrThrow({ where: { phone: "+15125550199" } });
      expect(user).toMatchObject({ smsOptInSource: "app", smsConsentVersion: expect.any(String) });
      expect(user.smsOptInAt).toBeInstanceOf(Date);

      const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${session.token}` } });
      expect(me.json<MeDTO>().relayNumber).toBe("+15555550100");
    });

    it("rejects missing, invalid, and used-up invite codes", async () => {
      await getPrisma().invite.create({ data: { code: "ONCE", maxUses: 1, uses: 1 } });
      const verify = (await post("/v1/auth/verify", { phone: "5125550198", code: "424242" })).json<AuthVerifyResult>();
      if (verify.status !== "needs_signup") throw new Error("expected signup");
      const base = { signupToken: verify.signupToken, name: "X", smsConsent: true };

      expect((await post("/v1/auth/signup", base)).json()).toEqual({ error: "Enter your invite code." });
      expect((await post("/v1/auth/signup", { ...base, inviteCode: "NOPE" })).json()).toEqual({ error: "That invite code isn't valid." });
      expect((await post("/v1/auth/signup", { ...base, inviteCode: "ONCE" })).json()).toEqual({ error: "That invite code has been used up." });
    });

    it("signs in an existing user", async () => {
      const user = await makeUser();
      const res = (await post("/v1/auth/verify", { phone: user.phone, code: "424242" })).json<AuthVerifyResult>();
      expect(res).toMatchObject({ status: "ok", me: { id: user.id } });
    });

    it("revokes sessions on sign-out-everywhere", async () => {
      const user = await makeUser();
      const token = await signSession(user);
      expect((await post("/v1/auth/logout-all", {}, token)).statusCode).toBe(200);
      const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(401);
    });
  });

  describe("approvals", () => {
    async function pendingAction(userId: string, data: { requiresPin?: boolean } = {}) {
      return getPrisma().action.create({
        data: {
          userId,
          type: "gmail_send",
          status: "AWAITING_CONFIRMATION",
          summary: "Send email to sam@example.com",
          payload: { to: ["sam@example.com"], subject: "Hi", body: "Hello" },
          expiresAt: new Date(Date.now() + 60_000),
          requiresPin: data.requiresPin ?? false,
        },
      });
    }

    it("approves in the app and queues the action once", async () => {
      const user = await makeUser();
      const token = await signSession(user);
      const action = await pendingAction(user.id);

      const res = await post(`/v1/actions/${action.id}/approve`, {}, token);
      expect(res.json()).toMatchObject({ id: action.id, state: "approved" });
      expect(await getQueue(QUEUE.actions).getJob(`action-${action.id}`)).toBeTruthy();

      const again = await post(`/v1/actions/${action.id}/approve`, {}, token);
      expect(again.statusCode).toBe(409);
    });

    it("requires the PIN when the action does, and locks after repeated misses", async () => {
      const user = await makeUser({ pinHash: await hashPin("2468") });
      const token = await signSession(user);
      const action = await pendingAction(user.id, { requiresPin: true });

      expect((await post(`/v1/actions/${action.id}/approve`, {}, token)).statusCode).toBe(400);
      for (let i = 0; i < 4; i++) {
        expect((await post(`/v1/actions/${action.id}/approve`, { pin: "0000" }, token)).statusCode).toBe(400);
      }
      expect((await post(`/v1/actions/${action.id}/approve`, { pin: "0000" }, token)).statusCode).toBe(423);
      expect((await post(`/v1/actions/${action.id}/approve`, { pin: "2468" }, token)).statusCode).toBe(423);
    });

    it("keeps other users' actions out of reach", async () => {
      const owner = await makeUser();
      const other = await makeUser();
      const action = await pendingAction(owner.id);
      const res = await post(`/v1/actions/${action.id}/approve`, {}, await signSession(other));
      expect(res.statusCode).toBe(404);
    });

    const sms = (from: string, body: string) =>
      signedTwilioRequest("/twilio/sms", {
        From: from,
        To: "+15555550100",
        Body: body,
        MessageSid: `SM${Math.random().toString(16).slice(2)}`,
        NumMedia: "0",
      });

    it("confirms by text with YES", async () => {
      const user = await makeUser();
      const action = await pendingAction(user.id);
      const res = await app.inject(sms(user.phone, "yes"));
      expect(res.body).toBe('<?xml version="1.0" encoding="UTF-8"?><Response/>');
      const after = await getPrisma().action.findUniqueOrThrow({ where: { id: action.id } });
      expect(after.status).toBe("CONFIRMED");
      expect(await getQueue(QUEUE.turns).count()).toBe(0);
    });

    it("skips by text with NO", async () => {
      const user = await makeUser();
      const action = await pendingAction(user.id);
      const res = await app.inject(sms(user.phone, "no"));
      expect(res.body).toContain("Okay, skipped.");
      expect((await getPrisma().action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("DENIED");
    });

    it("asks for the PIN by text when the action needs it", async () => {
      const user = await makeUser({ pinHash: await hashPin("2468") });
      const action = await pendingAction(user.id, { requiresPin: true });
      expect((await app.inject(sms(user.phone, "yes"))).body).toContain("followed by your PIN");
      expect((await app.inject(sms(user.phone, "yes 1111"))).body).toContain("didn't match");
      await app.inject(sms(user.phone, "YES 2468"));
      expect((await getPrisma().action.findUniqueOrThrow({ where: { id: action.id } })).status).toBe("CONFIRMED");
    });

    it("sends longer replies to the agent even with something pending", async () => {
      const user = await makeUser();
      await pendingAction(user.id);
      await app.inject(sms(user.phone, "yes but make it friendlier"));
      expect(await getQueue(QUEUE.turns).count()).toBe(1);
    });
  });

  describe("billing", () => {
    it("is an honest 501 until billing is built", async () => {
      const user = await makeUser();
      const res = await app.inject({
        method: "GET",
        url: "/v1/billing",
        headers: { authorization: `Bearer ${await signSession(user)}` },
      });
      expect(res.statusCode).toBe(501);
      expect(res.json().error).toMatch(/^TODO/);
    });
  });

  describe("spend cap", () => {
    it("reports today's spend against the cap", async () => {
      const user = await makeUser();
      await getPrisma().usage.create({
        data: { userId: user.id, model: "CLAUDE", providerModel: "claude-opus-5", inputTokens: 1000, outputTokens: 200, costMicros: 125_000 },
      });
      const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${await signSession(user)}` } });
      expect(me.json<MeDTO>().usage).toEqual({ spentCents: 12.5, capCents: 300 });
    });
  });

  describe("oauth", () => {
    it("rejects a callback without a valid state", async () => {
      const res = await app.inject({ method: "GET", url: "/oauth/google/callback?code=abc&state=forged" });
      expect(res.statusCode).toBe(400);
    });
  });
});
