import type { PendingApproval } from "./loop.js";

export type ConfirmationReply = { kind: "yes"; pin?: string } | { kind: "no" };

const YES_WORDS = "yes|y|yep|yeah|yup|ya|ok|okay|k|sure|confirm|confirmed|approve|approved|do it|send it|go ahead|go for it";
const NO_WORDS = "no|n|nope|nah|skip|deny|don'?t|do not|nevermind|never mind|hold off";

const YES = new RegExp(`^(?:${YES_WORDS})(?:[\\s,]+please)?(?:[\\s,:#-]+(\\d{4,8}))?[\\s.!]*$`, "i");
const PIN_ONLY = /^(\d{4,8})[\s.!]*$/;
const NO = new RegExp(`^(?:${NO_WORDS})(?:[\\s,]+(?:thanks|thank you))?[\\s.!]*$`, "i");

/**
 * Only short, unambiguous replies count. "yes but change the subject" is a new instruction for
 * the agent, not an approval.
 */
export function parseConfirmation(body: string): ConfirmationReply | null {
  const text = body.trim();
  const yes = YES.exec(text);
  if (yes) return yes[1] ? { kind: "yes", pin: yes[1] } : { kind: "yes" };
  const pin = PIN_ONLY.exec(text);
  if (pin?.[1]) return { kind: "yes", pin: pin[1] };
  if (NO.test(text)) return { kind: "no" };
  return null;
}

/** The text that asks for approval. Built from Action summaries, never from model prose. */
export function confirmationPrompt(pending: Pick<PendingApproval, "summary" | "requiresPin">[]): string {
  const pin = pending.some((p) => p.requiresPin);
  const reply = pin ? "Reply YES followed by your PIN" : "Reply YES";
  if (pending.length === 1) {
    return `${pending[0]!.summary}\n\n${reply} to go ahead, or NO to skip.`;
  }
  const list = pending.map((p, i) => `${i + 1}) ${p.summary}`).join("\n");
  return `${list}\n\n${reply} to do all ${pending.length}, or NO to skip.`;
}
