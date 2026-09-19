import { getPrisma } from "@relay/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadHistory, loadUserContext } from "../context.js";
import { forget, remember } from "./memory.js";
import type { ToolContext } from "./types.js";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("memory tools", () => {
  let ctx: ToolContext;

  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe('TRUNCATE "User" RESTART IDENTITY CASCADE');
    const user = await prisma.user.create({ data: { phone: "+15125550177", name: "Mem" } });
    ctx = {
      userId: user.id,
      userName: user.name,
      phone: user.phone,
      timezone: user.timezone,
      channel: "sms",
      conversationId: "none",
      now: new Date(),
      hasGoogle: false,
      onUsage: async () => {},
      keyFor: () => ({}),
    };
  });

  afterAll(async () => {
    await getPrisma().$disconnect();
  });

  it("saves a fact once and shows it in the prompt context", async () => {
    const first = await remember.run({ fact: "Wife's name is Sarah" }, ctx);
    expect(first.content).toMatch(/^Saved as \[/);
    const dupe = await remember.run({ fact: "wife's name is sarah" }, ctx);
    expect(dupe.content).toMatch(/^Already saved/);

    const user = await getPrisma().user.findUniqueOrThrow({ where: { id: ctx.userId } });
    const { context } = await loadUserContext(user);
    expect(context.memories.map((m) => m.fact)).toEqual(["Wife's name is Sarah"]);
  });

  it("forgets by ID and describes what will be deleted", async () => {
    await remember.run({ fact: "Allergic to peanuts" }, ctx);
    const saved = await getPrisma().memory.findFirstOrThrow({ where: { userId: ctx.userId } });

    expect(await forget.describe({ memoryIds: [saved.id] }, ctx)).toBe('Forget: "Allergic to peanuts"');
    const out = await forget.run({ memoryIds: [saved.id] }, ctx);
    expect(out.receipt).toBe('Forgot "Allergic to peanuts"');
    expect(await getPrisma().memory.count({ where: { userId: ctx.userId } })).toBe(0);
  });

  it("never touches another person's memories", async () => {
    const other = await getPrisma().user.create({ data: { phone: "+15125550178" } });
    const theirs = await getPrisma().memory.create({ data: { userId: other.id, fact: "Theirs" } });
    const out = await forget.run({ memoryIds: [theirs.id] }, ctx);
    expect(out.content).toMatch(/matched/);
    expect(await getPrisma().memory.count({ where: { id: theirs.id } })).toBe(1);
  });

  it("loads recent history oldest first, starting with the person's turn", async () => {
    const prisma = getPrisma();
    const convo = await prisma.conversation.create({ data: { userId: ctx.userId, channel: "SMS" } });
    const at = (s: number) => new Date(Date.UTC(2026, 8, 19, 12, 0, s));
    await prisma.message.createMany({
      data: [
        { conversationId: convo.id, direction: "OUTBOUND", role: "ASSISTANT", content: "reminder!", createdAt: at(0) },
        { conversationId: convo.id, direction: "INBOUND", role: "USER", content: "hi", createdAt: at(1) },
        { conversationId: convo.id, direction: "OUTBOUND", role: "ASSISTANT", content: "hello", createdAt: at(2) },
        { conversationId: convo.id, direction: "INBOUND", role: "USER", content: "now", createdAt: at(3) },
      ],
    });
    const history = await loadHistory(ctx.userId, at(3));
    expect(history).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });
});
