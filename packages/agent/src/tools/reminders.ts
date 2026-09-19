import {
  cancelReminder,
  createReminder,
  formatWhen,
  RECURRENCES,
  upcomingReminders,
  type Recurrence,
} from "@relay/core";
import { getPrisma } from "@relay/db";
import { z } from "zod";
import { defineTool } from "./types.js";

const REPEAT_LABEL: Record<Recurrence, string> = {
  daily: "every day",
  weekdays: "every weekday",
  weekly: "every week",
};

const MIN_LEAD_MS = 30_000;
const MAX_AHEAD_MS = 366 * 86_400_000;

export const setReminder = defineTool({
  name: "set_reminder",
  description:
    "Text the person a reminder at a specific time, optionally repeating. Convert relative times (\"in 20 minutes\", \"Sunday at 5\") to an absolute time using the current time and UTC offset in your context.",
  input: z.object({
    at: z.iso.datetime({ offset: true }).describe("When to send it, ISO 8601 with UTC offset"),
    message: z.string().trim().min(1).max(300).describe('What to remind them, e.g. "Call mom"'),
    repeat: z.enum(RECURRENCES).optional(),
  }),
  kind: "write",
  describe: ({ at, message, repeat }, ctx) =>
    `Remind you ${formatWhen(new Date(at), ctx.timezone, ctx.now)}${repeat ? `, repeating ${REPEAT_LABEL[repeat]}` : ""}: "${message}"`,
  async run({ at, message, repeat }, ctx) {
    const runAt = new Date(at);
    const lead = runAt.getTime() - Date.now();
    if (lead < MIN_LEAD_MS) return { content: "That time has already passed. Ask what time they meant." };
    if (lead > MAX_AHEAD_MS) return { content: "Reminders can be set up to a year ahead." };

    const reminder = await createReminder({
      userId: ctx.userId,
      runAt,
      body: message,
      recurrence: repeat ?? null,
    });
    const when = formatWhen(runAt, ctx.timezone, ctx.now);
    const repeats = repeat ? `, then ${REPEAT_LABEL[repeat]}` : "";
    return {
      content: `Reminder [${reminder.id}] set for ${when}${repeats}.`,
      receipt: `Reminder set for ${when}${repeats}: "${message}"`,
      data: { reminderId: reminder.id },
    };
  },
});

export const listReminders = defineTool({
  name: "list_reminders",
  description: "List the person's upcoming reminders with their IDs.",
  input: z.object({}),
  kind: "read",
  describe: () => "List your reminders",
  async run(_input, ctx) {
    const reminders = await upcomingReminders(ctx.userId);
    if (!reminders.length) return { content: "No upcoming reminders." };
    return {
      content: reminders
        .map((r) => {
          const repeat = r.recurrence ? ` (repeats ${REPEAT_LABEL[r.recurrence as Recurrence] ?? r.recurrence})` : "";
          return `- [${r.id}] ${formatWhen(r.runAt, ctx.timezone, ctx.now)}: "${r.body}"${repeat}`;
        })
        .join("\n"),
    };
  },
});

export const cancelReminderTool = defineTool({
  name: "cancel_reminder",
  description: "Cancel an upcoming reminder by its ID from list_reminders.",
  input: z.object({ reminderId: z.string().min(1) }),
  kind: "write",
  async describe({ reminderId }, ctx) {
    const r = await getPrisma().reminder.findFirst({ where: { id: reminderId, userId: ctx.userId } });
    return r
      ? `Cancel the reminder "${r.body}" for ${formatWhen(r.runAt, ctx.timezone, ctx.now)}`
      : "Cancel a reminder (not found)";
  },
  async run({ reminderId }, ctx) {
    const removed = await cancelReminder(ctx.userId, reminderId);
    if (!removed) return { content: "No reminder with that ID." };
    return {
      content: `Canceled "${removed.body}".`,
      receipt: `Canceled your reminder: "${removed.body}"`,
    };
  },
});
