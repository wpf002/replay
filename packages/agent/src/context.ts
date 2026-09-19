import { getPrisma, type User } from "@relay/db";
import type { AgentMessage } from "@relay/providers";
import { pendingActions } from "./approvals.js";
import type { ContextInput } from "./prompts.js";

/** Most recent memories injected into every prompt. */
const MEMORY_LIMIT = 60;
/** Prior conversation included with each turn. */
const HISTORY_MESSAGES = 24;
const HISTORY_CHARS = 12_000;

export interface UserContext {
  context: ContextInput;
  hasGoogle: boolean;
}

export async function loadUserContext(user: User, now = new Date()): Promise<UserContext> {
  const prisma = getPrisma();
  const [memories, google, pending] = await Promise.all([
    prisma.memory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: MEMORY_LIMIT,
      select: { id: true, fact: true },
    }),
    prisma.connection.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
      select: { accountEmail: true },
    }),
    pendingActions(user.id),
  ]);
  return {
    hasGoogle: Boolean(google),
    context: {
      now,
      timezone: user.timezone,
      name: user.name,
      memories: memories.reverse(),
      google: google ? { email: google.accountEmail } : null,
      pending: pending.map((a) => ({ summary: a.summary })),
    },
  };
}

/**
 * Recent messages across the person's conversations, oldest first, as model history.
 * `before` excludes the messages the current turn is answering.
 */
export async function loadHistory(userId: string, before: Date): Promise<AgentMessage[]> {
  const rows = await getPrisma().message.findMany({
    where: {
      conversation: { userId, direction: "INBOUND" },
      createdAt: { lt: before },
      role: { in: ["USER", "ASSISTANT"] },
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_MESSAGES,
    select: { role: true, content: true },
  });

  const out: AgentMessage[] = [];
  let chars = 0;
  for (const row of rows) {
    chars += row.content.length;
    if (chars > HISTORY_CHARS) break;
    out.unshift({ role: row.role === "USER" ? "user" : "assistant", content: row.content });
  }
  // History must open with the user's turn.
  while (out[0]?.role === "assistant") out.shift();
  return out;
}
