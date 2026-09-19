import { getPrisma } from "@relay/db";
import { z } from "zod";
import { defineTool } from "./types.js";

export const MAX_MEMORIES = 200;

export const remember = defineTool({
  name: "remember",
  description:
    'Save a lasting fact about the person for future conversations: names of family, friends, and coworkers, preferences, routines, addresses, important dates. Write one short standalone statement, like "Wife\'s name is Sarah" or "Prefers aisle seats". Skip one-off requests and anything already saved.',
  input: z.object({
    fact: z.string().trim().min(3).max(280).describe("One standalone statement."),
  }),
  kind: "write",
  describe: ({ fact }) => `Remember: "${fact}"`,
  async run({ fact }, ctx) {
    const prisma = getPrisma();
    const existing = await prisma.memory.findFirst({
      where: { userId: ctx.userId, fact: { equals: fact, mode: "insensitive" } },
    });
    if (existing) return { content: `Already saved as [${existing.id}].` };

    const count = await prisma.memory.count({ where: { userId: ctx.userId } });
    if (count >= MAX_MEMORIES) {
      return {
        content: `Memory is full (${MAX_MEMORIES} facts). Ask which saved facts to forget before adding more.`,
      };
    }
    const memory = await prisma.memory.create({
      data: { userId: ctx.userId, fact, sourceMessageId: ctx.sourceMessageId ?? null },
    });
    return {
      content: `Saved as [${memory.id}].`,
      receipt: `Saved: "${fact}"`,
      data: { memoryId: memory.id },
    };
  },
});

export const forget = defineTool({
  name: "forget",
  description:
    "Delete saved facts by their bracketed IDs from the memory list in your context. Use when the person asks you to forget something or corrects a saved fact (forget the old one, then remember the new one).",
  input: z.object({
    memoryIds: z.array(z.string().min(1)).min(1).max(20),
  }),
  kind: "write",
  async describe({ memoryIds }, ctx) {
    const facts = await getPrisma().memory.findMany({
      where: { userId: ctx.userId, id: { in: memoryIds } },
      select: { fact: true },
    });
    if (!facts.length) return "Forget saved facts (none match)";
    return `Forget: ${facts.map((f) => `"${f.fact}"`).join(", ")}`;
  },
  async run({ memoryIds }, ctx) {
    const prisma = getPrisma();
    const facts = await prisma.memory.findMany({
      where: { userId: ctx.userId, id: { in: memoryIds } },
      select: { fact: true },
    });
    const { count } = await prisma.memory.deleteMany({
      where: { userId: ctx.userId, id: { in: memoryIds } },
    });
    if (!count) return { content: "None of those IDs matched a saved fact." };
    return {
      content: `Deleted ${count} saved fact${count === 1 ? "" : "s"}.`,
      receipt: `Forgot ${facts.map((f) => `"${f.fact}"`).join(", ")}`,
    };
  },
});
