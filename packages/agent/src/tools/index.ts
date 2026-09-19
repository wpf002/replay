import { calendarCreate, calendarList } from "./calendar.js";
import { gmailRead, gmailSearch, gmailSend } from "./gmail.js";
import { forget, remember } from "./memory.js";
import { cancelReminderTool, listReminders, setReminder } from "./reminders.js";
import type { AnyTool } from "./types.js";
import { webSearch } from "./web.js";

export * from "./types.js";
export {
  calendarCreate,
  calendarList,
  cancelReminderTool,
  forget,
  gmailRead,
  gmailSearch,
  gmailSend,
  listReminders,
  remember,
  setReminder,
  webSearch,
};

const ALL: AnyTool[] = [
  webSearch,
  remember,
  forget,
  setReminder,
  listReminders,
  cancelReminderTool,
  gmailSearch,
  gmailRead,
  gmailSend,
  calendarList,
  calendarCreate,
];

/** Tools available for this person on this channel. */
export function toolsFor(opts: { channel: "sms" | "voice"; hasGoogle: boolean }): AnyTool[] {
  return ALL.filter(
    (t) => (!t.needsGoogle || opts.hasGoogle) && (opts.channel === "sms" || !t.smsOnly),
  );
}

export function findTool(name: string): AnyTool | undefined {
  return ALL.find((t) => t.name === name);
}
