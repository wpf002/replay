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

// ── API shapes shared by apps/api, apps/web, and apps/mobile ─────────────

export type ActionState =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "running"
  | "done"
  | "failed";

export interface MeDTO {
  id: string;
  phone: string;
  name: string | null;
  timezone: string;
  defaultModel: ModelId;
  hasPin: boolean;
  pinLocked: boolean;
  smsOptedOut: boolean;
  /** The number people text and call. */
  relayNumber: string | null;
  google: { connected: boolean; email: string | null; missingScopes: boolean };
  usage: { spentCents: number; capCents: number };
  counts: { pendingActions: number; memories: number; upcomingReminders: number };
  createdAt: string;
}

export interface ActionDTO {
  id: string;
  type: string;
  state: ActionState;
  summary: string;
  risk: "low" | "medium" | "high";
  requiresPin: boolean;
  /** Requested after Relay read email, calendar, or web content. */
  tainted: boolean;
  channel: Channel;
  createdAt: string;
  expiresAt: string | null;
  completedAt: string | null;
  error: string | null;
}

export interface HistoryItemDTO {
  id: string;
  conversationId: string;
  channel: Channel;
  /** Outbound calls Relay placed for an errand. */
  callOut: boolean;
  from: "user" | "relay" | "other";
  content: string;
  model: ModelId | null;
  createdAt: string;
}

export interface MemoryDTO {
  id: string;
  fact: string;
  createdAt: string;
}

export interface ReminderDTO {
  id: string;
  body: string;
  runAt: string;
  sentAt: string | null;
}

export type AuthVerifyResult =
  | { status: "ok"; token: string; me: MeDTO }
  | { status: "needs_signup"; signupToken: string; inviteRequired: boolean };

export interface AuthSession {
  token: string;
  me: MeDTO;
}

/** Deep-link scheme registered by apps/mobile (app.json "scheme"). */
export const APP_SCHEME = "relay";
