export const MODELS = ["claude", "gpt", "perplexity"] as const;
export type ModelId = (typeof MODELS)[number];

export type Channel = "sms" | "voice";

/** One inbound turn from any channel, normalized. */
export interface InboundTurn {
  userId: string;
  channel: Channel;
  from: string; // E.164
  text: string;
  providerMessageId?: string;
}

/** Explicit routing prefixes a user can type or say. */
export const ROUTE_PREFIXES: Record<string, ModelId> = {
  "@claude": "claude",
  "@gpt": "gpt",
  "@chatgpt": "gpt",
  "@web": "perplexity",
  "@perplexity": "perplexity",
};

/**
 * Consent shown next to an unchecked checkbox wherever someone signs up (app and web).
 * The same text is stored with the opt-in record, so change the version when the wording changes.
 */
export const SMS_CONSENT_VERSION = "2026-09-19";
export const SMS_CONSENT_TEXT =
  "I agree to receive conversational and account text messages from Relay at this number, " +
  "including replies to my messages, reminders I set, and confirmation requests. " +
  "Message frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.";

/** A required env var is missing. HTTP layers map this to 501 with the TODO in the message. */
export class NotConfiguredError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    super(`TODO: set ${variable} to enable this`);
    this.name = "NotConfiguredError";
    this.variable = variable;
  }
}
