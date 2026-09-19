import { getPrisma, type Reminder } from "@relay/db";
import { log } from "./log.js";
import { cancelReminderJob, scheduleReminder } from "./queues.js";
import { addLocalDays, zonedParts } from "./time.js";

export const RECURRENCES = ["daily", "weekdays", "weekly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export function isRecurrence(value: string | null): value is Recurrence {
  return value !== null && (RECURRENCES as readonly string[]).includes(value);
}

/** The first occurrence after `after`, keeping the same local time of day. */
export function nextOccurrence(runAt: Date, recurrence: Recurrence, timeZone: string, after = new Date()): Date {
  let next = runAt;
  do {
    if (recurrence === "weekly") {
      next = addLocalDays(next, 7, timeZone);
    } else {
      next = addLocalDays(next, 1, timeZone);
      if (recurrence === "weekdays") {
        while (["Sat", "Sun"].includes(zonedParts(next, timeZone).weekday)) {
          next = addLocalDays(next, 1, timeZone);
        }
      }
    }
  } while (next <= after);
  return next;
}

export async function createReminder(r: {
  userId: string;
  runAt: Date;
  body: string;
  recurrence: Recurrence | null;
}): Promise<Reminder> {
  const prisma = getPrisma();
  const reminder = await prisma.reminder.create({
    data: { userId: r.userId, runAt: r.runAt, body: r.body, recurrence: r.recurrence },
  });
  const jobId = await scheduleReminder(reminder.id, r.runAt);
  return prisma.reminder.update({ where: { id: reminder.id }, data: { jobId } });
}

/** Deletes the reminder and its queued job. Returns null when it isn't the user's. */
export async function cancelReminder(userId: string, reminderId: string): Promise<Reminder | null> {
  const prisma = getPrisma();
  const reminder = await prisma.reminder.findFirst({ where: { id: reminderId, userId } });
  if (!reminder) return null;
  if (reminder.jobId) {
    await cancelReminderJob(reminder.jobId).catch((err: unknown) =>
      log.warn({ err, reminderId }, "reminder job already gone"),
    );
  }
  await prisma.reminder.delete({ where: { id: reminder.id } });
  return reminder;
}

/** Reminders that will still fire: unsent one-offs and every repeating one. */
export function upcomingReminders(userId: string): Promise<Reminder[]> {
  return getPrisma().reminder.findMany({
    where: { userId, OR: [{ sentAt: null }, { recurrence: { not: null } }] },
    orderBy: { runAt: "asc" },
    take: 50,
  });
}
