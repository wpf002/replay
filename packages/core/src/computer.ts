import { getPrisma, type ComputerTask } from "@relay/db";
import type { ComputerInput } from "@relay/types";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "./env.js";
import { UserError } from "./errors.js";
import { enqueueComputerTask } from "./queues.js";
import { rateLimit } from "./rate-limit.js";
import { redis } from "./redis.js";

export const TASKS_PER_DAY = 25;
const ACTIVE_TASKS = 2;
export const ACTIVE_TASK_STATUSES = ["QUEUED", "RUNNING", "WAITING_APPROVAL", "WAITING_USER"] as const;

/** How the API and the app talk to a running browser task. */
export type ComputerSignal =
  | { type: "approved" }
  | { type: "denied" }
  | { type: "resume" }
  | { type: "cancel" }
  | { type: "answer"; text: string }
  | { type: "input"; input: ComputerInput };

const SIGNAL_TTL_S = 60 * 60;
const SCREEN_TTL_S = 2 * 60 * 60;

export const signalKey = (taskId: string) => `computer:signal:${taskId}`;
const screenKey = (taskId: string) => `computer:screen:${taskId}`;
const screenVersionKey = (taskId: string) => `computer:screen-version:${taskId}`;

/** Queues a signal for the worker running this task. Signals are transient and never logged. */
export async function pushComputerSignal(taskId: string, signal: ComputerSignal): Promise<void> {
  const key = signalKey(taskId);
  await redis().multi().rpush(key, JSON.stringify(signal)).expire(key, SIGNAL_TTL_S).exec();
}

/** Latest screenshot (JPEG) of a task's browser, for the live view. */
export async function saveScreen(taskId: string, jpeg: Buffer): Promise<string> {
  const version = Date.now().toString(36);
  await redis()
    .multi()
    .set(screenKey(taskId), jpeg, "EX", SCREEN_TTL_S)
    .set(screenVersionKey(taskId), version, "EX", SCREEN_TTL_S)
    .exec();
  return version;
}

export async function readScreen(taskId: string): Promise<Buffer | null> {
  return redis().getBuffer(screenKey(taskId));
}

export async function screenVersions(taskIds: string[]): Promise<Map<string, string | null>> {
  if (!taskIds.length) return new Map();
  const values = await redis().mget(taskIds.map(screenVersionKey));
  return new Map(taskIds.map((id, i) => [id, values[i] ?? null]));
}

/** Where a person's browser profile lives: their sign-ins and cookies for the sites Relay uses. */
export function browserProfileDir(userId: string): string {
  const base = env().BROWSER_PROFILE_DIR ?? join(homedir(), ".relay", "browser-profiles");
  if (!/^[a-z0-9]+$/i.test(userId)) throw new Error("Invalid user ID for a browser profile");
  return join(base, userId);
}

/** A task stopped on a question the person answers by text. Their next text goes to it. */
export async function taskAwaitingAnswer(userId: string) {
  return getPrisma().computerTask.findFirst({
    where: { userId, status: "WAITING_USER", waitingKind: "answer" },
    orderBy: { updatedAt: "desc" },
  });
}

export async function addComputerStep(taskId: string, kind: string, text: string): Promise<void> {
  await getPrisma().computerStep.create({ data: { taskId, kind, text: text.slice(0, 500) } });
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Queues a task for Relay's browser. "browse" tasks are driven by the model; "signin" opens a
 * site for the person to sign in themselves, so later tasks can use their account.
 */
export async function startComputerTask(
  userId: string,
  opts: { goal: string; startUrl?: string | null; mode?: "browse" | "signin"; conversationId?: string | null },
): Promise<ComputerTask> {
  const prisma = getPrisma();
  const limit = await rateLimit(`computer:${userId}`, TASKS_PER_DAY, 24 * 60 * 60);
  if (!limit.allowed) throw new UserError(`Relay does up to ${TASKS_PER_DAY} browser tasks a day. Try again tomorrow.`, 429);
  const active = await prisma.computerTask.count({ where: { userId, status: { in: [...ACTIVE_TASK_STATUSES] } } });
  if (active >= ACTIVE_TASKS) {
    throw new UserError("Relay is already working on 2 browser tasks. Wait for one to finish, or cancel one in the app.", 409);
  }
  const mode = opts.mode ?? "browse";
  const task = await prisma.computerTask.create({
    data: {
      userId,
      goal: opts.goal.trim().slice(0, 2000),
      startUrl: opts.startUrl ?? null,
      mode,
      conversationId: opts.conversationId ?? null,
    },
  });
  await addComputerStep(task.id, "note", mode === "signin" && opts.startUrl ? `Opening ${hostOf(opts.startUrl)}` : "Starting up");
  await enqueueComputerTask(task.id);
  return task;
}
