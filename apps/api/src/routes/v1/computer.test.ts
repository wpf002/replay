import { closeQueues, closeRedis, getQueue, QUEUE, redis, saveScreen, signalKey } from "@relay/core";
import { getPrisma, type User } from "@relay/db";
import type { ComputerTaskDTO } from "@relay/types";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../app.js";
import { signSession } from "../../auth/tokens.js";
import { hasDb, makeUser, resetState } from "../../test/helpers.js";

describe.skipIf(!hasDb)("/v1/computer", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });
  beforeEach(resetState);
  afterAll(async () => {
    await app.close();
    await getQueue(QUEUE.computer).obliterate({ force: true });
    await closeQueues();
    await closeRedis();
    await getPrisma().$disconnect();
  });

  const call = async (user: User, method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${await signSession(user)}` }, ...(payload ? { payload } : {}) });

  const signals = async (taskId: string) => (await redis().lrange(signalKey(taskId), 0, -1)).map((s) => JSON.parse(s));

  it("starts a task, queues it, and shows it as active", async () => {
    const user = await makeUser();
    const res = await call(user, "POST", "/v1/computer/tasks", { task: "Order oat milk and eggs on Instacart for delivery today" });
    expect(res.statusCode).toBe(200);
    const task = res.json<ComputerTaskDTO>();
    expect(task).toMatchObject({ state: "queued", mode: "browse", steps: [{ kind: "note", text: "Starting up" }] });
    expect(await getQueue(QUEUE.computer).getJob(`computer-${task.id}`)).toBeTruthy();

    const list = (await call(user, "GET", "/v1/computer/tasks")).json<{ active: ComputerTaskDTO[] }>();
    expect(list.active.map((t) => t.id)).toEqual([task.id]);
  });

  it("allows two tasks at a time", async () => {
    const user = await makeUser();
    for (let i = 0; i < 2; i++) expect((await call(user, "POST", "/v1/computer/tasks", { task: `Look up store hours number ${i}` })).statusCode).toBe(200);
    const third = await call(user, "POST", "/v1/computer/tasks", { task: "Look up store hours again" });
    expect(third.statusCode).toBe(409);
  });

  it("only takes browser input while the person has control", async () => {
    const user = await makeUser();
    const task = await getPrisma().computerTask.create({ data: { userId: user.id, goal: "Sign in to instacart.com", status: "RUNNING" } });
    const click = { type: "click", x: 100, y: 200 };
    expect((await call(user, "POST", `/v1/computer/tasks/${task.id}/input`, click)).statusCode).toBe(409);

    await getPrisma().computerTask.update({ where: { id: task.id }, data: { status: "WAITING_USER", waitingKind: "takeover" } });
    expect((await call(user, "POST", `/v1/computer/tasks/${task.id}/input`, click)).statusCode).toBe(200);
    expect((await call(user, "POST", `/v1/computer/tasks/${task.id}/input`, { type: "type", text: "secret" })).statusCode).toBe(200);
    expect((await call(user, "POST", `/v1/computer/tasks/${task.id}/resume`, {})).statusCode).toBe(200);
    expect(await signals(task.id)).toEqual([
      { type: "input", input: click },
      { type: "input", input: { type: "type", text: "secret" } },
      { type: "resume" },
    ]);
    // Typed text is passed along, never stored.
    expect(JSON.stringify(await getPrisma().computerStep.findMany())).not.toContain("secret");
  });

  it("serves the live screen only to the task's owner", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const task = await getPrisma().computerTask.create({ data: { userId: owner.id, goal: "x", status: "RUNNING" } });
    await saveScreen(task.id, Buffer.from([0xff, 0xd8, 0xff]));

    const res = await call(owner, "GET", `/v1/computer/tasks/${task.id}/screen`);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect((await call(other, "GET", `/v1/computer/tasks/${task.id}/screen`)).statusCode).toBe(404);
    expect((await call(owner, "GET", `/v1/computer/tasks/${task.id}`)).json<ComputerTaskDTO>().screenVersion).toBeTruthy();
  });

  it("cancels queued tasks directly and running ones by signal", async () => {
    const user = await makeUser();
    const queued = await getPrisma().computerTask.create({ data: { userId: user.id, goal: "x" } });
    const running = await getPrisma().computerTask.create({ data: { userId: user.id, goal: "y", status: "RUNNING" } });
    await call(user, "POST", `/v1/computer/tasks/${queued.id}/cancel`, {});
    await call(user, "POST", `/v1/computer/tasks/${running.id}/cancel`, {});
    expect((await getPrisma().computerTask.findUniqueOrThrow({ where: { id: queued.id } })).status).toBe("CANCELED");
    expect(await signals(running.id)).toEqual([{ type: "cancel" }]);
  });

  it("opens a site for signing in", async () => {
    const user = await makeUser();
    const res = await call(user, "POST", "/v1/computer/signin", { url: "www.instacart.com" });
    expect(res.json<ComputerTaskDTO>()).toMatchObject({ mode: "signin", goal: "Sign in to instacart.com" });
    expect((await call(user, "POST", "/v1/computer/signin", { url: "javascript:alert(1)" })).statusCode).toBe(400);
  });
});
