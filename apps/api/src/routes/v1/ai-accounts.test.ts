import { closeQueues, closeRedis, connectBrowserAccount, getQueue, QUEUE, userModelKeys } from "@relay/core";
import { getPrisma, type User } from "@relay/db";
import type { ComputerTaskDTO, MeDTO } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../app.js";
import { signSession } from "../../auth/tokens.js";
import { hasDb, makeUser, resetState } from "../../test/helpers.js";

// Checking a key calls the provider; the verdict is stubbed here.
const verifyKey = vi.hoisted(() => vi.fn());
vi.mock("@relay/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@relay/providers")>()),
  verifyKey,
}));

const CLAUDE_KEY = `sk-ant-api03-${"a".repeat(40)}WXYZ`;

describe.skipIf(!hasDb)("/v1/ai-accounts", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  beforeEach(async () => {
    await resetState();
    verifyKey.mockReset();
    verifyKey.mockResolvedValue({ ok: true });
  });
  afterAll(async () => {
    await app.close();
    await getQueue(QUEUE.computer).obliterate({ force: true });
    await closeQueues();
    await closeRedis();
    await getPrisma().$disconnect();
  });

  const send = async (user: User, method: "PUT" | "DELETE", provider: string, key?: string) =>
    app.inject({
      method,
      url: `/v1/ai-accounts/${provider}`,
      headers: { authorization: `Bearer ${await signSession(user)}` },
      ...(key !== undefined ? { payload: { key } } : {}),
    });

  it("checks a key, stores it encrypted, and shows only a hint", async () => {
    const user = await makeUser();
    const res = await send(user, "PUT", "claude", ` ${CLAUDE_KEY} `);
    expect(res.statusCode).toBe(200);
    expect(verifyKey).toHaveBeenCalledWith("claude", CLAUDE_KEY);

    const me = res.json<MeDTO>();
    expect(me.aiAccounts.find((a) => a.provider === "claude")).toMatchObject({ connected: true, hint: "…WXYZ", invalid: false });
    expect(me.aiAccounts.find((a) => a.provider === "gpt")).toMatchObject({ connected: false, hint: null });
    expect(res.body).not.toContain(CLAUDE_KEY);

    const row = await getPrisma().modelKey.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.keyEnc).not.toContain(CLAUDE_KEY);
    expect(await userModelKeys(user.id)).toEqual({ claude: CLAUDE_KEY });
  });

  it("turns away a key meant for another provider without checking it", async () => {
    const user = await makeUser();
    const res = await send(user, "PUT", "gpt", CLAUDE_KEY);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "That's a Claude key. Connect it under Claude instead.", reason: "wrong_provider:claude" });
    expect(verifyKey).not.toHaveBeenCalled();
  });

  it("passes the provider's verdict through and saves nothing", async () => {
    const user = await makeUser();
    verifyKey.mockResolvedValue({ ok: false, problem: "no_credit", message: "That key works, but the Anthropic account has no credit. Add some, then connect again." });
    const res = await send(user, "PUT", "claude", CLAUDE_KEY);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ reason: "no_credit" });
    expect(await getPrisma().modelKey.count()).toBe(0);
  });

  it("limits how often someone can try keys", async () => {
    const user = await makeUser();
    verifyKey.mockResolvedValue({ ok: false, problem: "invalid", message: "That key was rejected." });
    for (let i = 0; i < 10; i++) expect((await send(user, "PUT", "claude", CLAUDE_KEY)).statusCode).toBe(400);
    expect((await send(user, "PUT", "claude", CLAUDE_KEY)).statusCode).toBe(429);
    expect(verifyKey).toHaveBeenCalledTimes(10);
  });

  it("connects an account by opening the provider's own app to sign in", async () => {
    const user = await makeUser();
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai-accounts/gpt/signin",
      headers: { authorization: `Bearer ${await signSession(user)}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<ComputerTaskDTO>()).toMatchObject({ mode: "signin", goal: "Sign in to ChatGPT" });
    expect(await getPrisma().computerTask.findFirstOrThrow({})).toMatchObject({
      provider: "GPT",
      startUrl: "https://chatgpt.com/auth/login",
    });
    // Connecting happens when they finish signing in, not when the page opens.
    expect(await getPrisma().modelKey.count()).toBe(0);
  });

  it("keeps signed-in accounts out of the API-key path", async () => {
    const user = await makeUser();
    await connectBrowserAccount(user.id, "claude");
    expect(await userModelKeys(user.id)).toEqual({});
    const me = await app.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${await signSession(user)}` } });
    expect(me.json<MeDTO>().aiAccounts.find((a) => a.provider === "claude")).toMatchObject({ connected: true, mode: "browser", hint: null });
  });

  it("disconnects", async () => {
    const user = await makeUser();
    await send(user, "PUT", "claude", CLAUDE_KEY);
    const res = await send(user, "DELETE", "claude");
    expect(res.statusCode).toBe(200);
    expect(res.json<MeDTO>().aiAccounts.every((a) => !a.connected)).toBe(true);
    expect(await getPrisma().modelKey.count()).toBe(0);
  });
});
