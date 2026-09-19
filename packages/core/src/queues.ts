import { Queue, type JobsOptions } from "bullmq";
import { redis } from "./redis.js";

export const QUEUE = {
  /** One inbound SMS turn: run the agent and text the reply. */
  turns: "turns",
  /** Execute an Action the user confirmed. */
  actions: "actions",
  /** Delayed jobs that text a reminder at its time. */
  reminders: "reminders",
} as const;

export interface TurnJob {
  userId: string;
  messageId: string;
}

export interface ActionJob {
  actionId: string;
}

export interface ReminderJob {
  reminderId: string;
}

const RETAIN: JobsOptions = {
  removeOnComplete: { count: 1000 },
  removeOnFail: { count: 5000 },
};

const queues = new Map<string, Queue>();

export function getQueue(name: (typeof QUEUE)[keyof typeof QUEUE]): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redis() });
    queues.set(name, q);
  }
  return q;
}

/**
 * The short delay lets a burst of texts ("hey" / "what's on my calendar" / "tomorrow")
 * coalesce into one agent turn. jobId dedupes Twilio webhook retries.
 */
export async function enqueueTurn(job: TurnJob, jobId: string, delayMs = 1200): Promise<void> {
  await getQueue(QUEUE.turns).add("turn", job, {
    ...RETAIN,
    jobId,
    delay: delayMs,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}

export async function enqueueAction(actionId: string): Promise<void> {
  await getQueue(QUEUE.actions).add("action", { actionId } satisfies ActionJob, {
    ...RETAIN,
    jobId: `action-${actionId}`,
    attempts: 1,
  });
}

export async function scheduleReminder(reminderId: string, runAt: Date): Promise<string> {
  const jobId = `reminder-${reminderId}`;
  await getQueue(QUEUE.reminders).add("reminder", { reminderId } satisfies ReminderJob, {
    ...RETAIN,
    jobId,
    delay: Math.max(0, runAt.getTime() - Date.now()),
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });
  return jobId;
}

export async function cancelReminderJob(jobId: string): Promise<void> {
  await getQueue(QUEUE.reminders).remove(jobId);
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
