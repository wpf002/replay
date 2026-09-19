import { closeQueues, closeRedis, connectBrowserAccount, getQueue, QUEUE, redis } from "@relay/core";
import { getPrisma, type Conversation, type User } from "@relay/db";
import type { Job } from "bullmq";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { processTurn } from "./turns.js";

const hasDb = Boolean(process.env.DATABASE_URL);

/** A text arriving from Twilio, already stored, with the turn job that follows it. */
async function inbound(user: User, conversation: Conversation, content: string) {
  const message = await getPrisma().message.create({
    data: { conversationId: conversation.id, direction: "INBOUND", role: "USER", content },
  });
  return { data: { userId: user.id, messageId: message.id }, attemptsMade: 0, opts: { attempts: 1 } } as Job<{ userId: string; messageId: string }>;
}

describe.skipIf(!hasDb)("smsTurn routing", () => {
  let user: User;
  let conversation: Conversation;

  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe('TRUNCATE "User" RESTART IDENTITY CASCADE');
    await redis().flushdb();
    user = await prisma.user.create({ data: { phone: "+15125550177", name: "Tess", smsOptInAt: new Date() } });
    conversation = await prisma.conversation.create({ data: { userId: user.id, channel: "SMS", direction: "INBOUND" } });
  });

  afterAll(async () => {
    for (const q of [QUEUE.computer, QUEUE.actions]) await getQueue(q).obliterate({ force: true });
    await closeQueues();
    await closeRedis();
    await getPrisma().$disconnect();
  });

  it("sends texts to a signed-in account instead of the API", async () => {
    await connectBrowserAccount(user.id, "gpt");
    await processTurn(await inbound(user, conversation, "@gpt what's 2+2?"));

    const task = await getPrisma().computerTask.findFirstOrThrow({});
    expect(task).toMatchObject({ mode: "chat", provider: "GPT", goal: "what's 2+2?", conversationId: conversation.id });
    expect(await getQueue(QUEUE.computer).getJob(`computer-${task.id}`)).toBeTruthy();
    // The answer comes from the task, so the turn itself says nothing.
    expect(await getPrisma().message.count({ where: { direction: "OUTBOUND" } })).toBe(0);
  });

  it("leaves providers without an account to the usual path", async () => {
    await connectBrowserAccount(user.id, "gpt");
    await processTurn(await inbound(user, conversation, "@web is the DMV open saturday?"));
    expect(await getPrisma().computerTask.count()).toBe(0);
  });

  it("routes a reply to a task that asked a question, and 'cancel' stops it", async () => {
    const task = await getPrisma().computerTask.create({
      data: { userId: user.id, goal: "Book a table", status: "WAITING_USER", waitingKind: "answer", waitingFor: "7pm or 8pm?" },
    });
    await processTurn(await inbound(user, conversation, "8pm please"));
    await processTurn(await inbound(user, conversation, "cancel"));

    const signals = (await redis().lrange(`computer:signal:${task.id}`, 0, -1)).map((s) => JSON.parse(s));
    expect(signals).toEqual([{ type: "answer", text: "8pm please" }, { type: "cancel" }]);
    const replies = await getPrisma().message.findMany({ where: { direction: "OUTBOUND" }, orderBy: { createdAt: "asc" } });
    expect(replies.map((m) => m.content)).toEqual(["Got it.", "Stopped."]);
  });
});
