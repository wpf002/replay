import { calendarCreate, calendarList } from "./calendar.js";
import { gmailRead, gmailSearch, gmailSend } from "./gmail.js";
import { forget, remember } from "./memory.js";
import { cancelReminderTool, listReminders, setReminder } from "./reminders.js";
import type { AnyTool } from "./types.js";
import { endCall, followUpByText, textMe } from "./voice.js";
import { webSearch } from "./web.js";

export * from "./types.js";
export {
  calendarCreate,
  calendarList,
  cancelReminderTool,
  endCall,
  followUpByText,
  forget,
  gmailRead,
  gmailSearch,
  gmailSend,
  listReminders,
  remember,
  setReminder,
  textMe,
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
  textMe,
  followUpByText,
  endCall,
];

export interface ToolFilter {
  channel: "sms" | "voice";
  hasGoogle: boolean;
  /**
   * Calls whose caller ID isn't verified (no STIR/SHAKEN A attestation, no PIN yet) get no
   * access to the person's email, calendar, or memory. Anything sensitive goes out by text.
   */
  callerVerified?: boolean;
}

/** Tools available for this person on this channel. */
export function toolsFor(opts: ToolFilter): AnyTool[] {
  const verified = opts.channel === "sms" || opts.callerVerified === true;
  return ALL.filter((t) => {
    if (opts.channel === "sms" && t.voiceOnly) return false;
    if (opts.channel === "voice" && t.smsOnly) return false;
    if (t.needsGoogle && (!opts.hasGoogle || !verified)) return false;
    if (!verified && (t === remember || t === forget)) return false;
    return true;
  });
}

export function findTool(name: string): AnyTool | undefined {
  return ALL.find((t) => t.name === name);
}
