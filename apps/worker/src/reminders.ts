import {
  isRecurrence,
  nextOccurrence,
  scheduleReminder,
  textUser,
  type ReminderJob,
} from "@relay/core";
import { getPrisma } from "@relay/db";
import type { Job } from "bullmq";

/** Texts a due reminder, then schedules the next occurrence of a repeating one. */
export async function processReminder(job: Job<ReminderJob>): Promise<void> {
  const prisma = getPrisma();
  const reminder = await prisma.reminder.findUnique({
    where: { id: job.data.reminderId },
    include: { user: true },
  });
  // Canceled, already sent, or superseded by a newer job for the same reminder.
  if (!reminder || reminder.jobId !== job.id) return;
  if (reminder.sentAt && !reminder.recurrence) return;

  await textUser({
    user: reminder.user,
    body: `Reminder: ${reminder.body}`,
    metadata: { kind: "reminder", reminderId: reminder.id },
  });

  const now = new Date();
  if (isRecurrence(reminder.recurrence)) {
    const next = nextOccurrence(reminder.runAt, reminder.recurrence, reminder.user.timezone, now);
    const jobId = await scheduleReminder(reminder.id, next);
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { runAt: next, jobId, sentAt: now },
    });
  } else {
    await prisma.reminder.update({ where: { id: reminder.id }, data: { sentAt: now } });
  }
}
