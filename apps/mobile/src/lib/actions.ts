import type { ActionDTO, ActionState } from "@relay/types";
import type { IconName } from "../ui/icon";

const TYPES: Record<string, { label: string; icon: IconName }> = {
  gmail_send: { label: "Send email", icon: "mail" },
  calendar_create: { label: "Add to calendar", icon: "calendar" },
  place_call: { label: "Call a business", icon: "phone-outgoing" },
  use_computer: { label: "Use Relay's browser", icon: "globe" },
  computer_confirm: { label: "Finish on the web", icon: "globe" },
  remember: { label: "Save to memory", icon: "bookmark" },
  forget: { label: "Forget", icon: "trash-2" },
  set_reminder: { label: "Set a reminder", icon: "bell" },
  cancel_reminder: { label: "Cancel a reminder", icon: "bell-off" },
};

export function actionMeta(a: Pick<ActionDTO, "type">): { label: string; icon: IconName } {
  return TYPES[a.type] ?? { label: a.type.replace(/_/g, " "), icon: "zap" };
}

export const STATE_LABEL: Record<ActionState, string> = {
  pending: "Waiting",
  approved: "Approved",
  denied: "Skipped",
  expired: "Expired",
  running: "In progress",
  done: "Done",
  failed: "Failed",
};
