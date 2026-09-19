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
  /** The person's own provider keys. */
  aiAccounts: AiAccountDTO[];
  /** Models Relay runs on its own keys for people who haven't connected theirs. */
  includedModels: ModelId[];
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
  /** Next time it fires. */
  runAt: string;
  recurrence: "daily" | "weekdays" | "weekly" | null;
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

// ── AI accounts: people can connect their own provider API keys ─────────────

export interface AiProviderInfo {
  /** What people call it. */
  name: string;
  company: string;
  prefix: string;
  /** Where a person creates an API key. */
  keyUrl: string;
  /** Start of a key, shown as a placeholder. */
  keyPrefix: string;
  /** Where a person adds credit to their API account. */
  billingUrl: string;
  /** The provider's own chat app, where Relay opens threads in the person's account. */
  chatUrl: string;
  /** Where that app asks them to sign in. */
  signInUrl: string;
  /** What the subscription is called, for "your ChatGPT Plus plan". */
  planName: string;
  /** Why a subscription login isn't enough, and who pays. */
  billingNote: string;
}

export const AI_PROVIDERS: Record<ModelId, AiProviderInfo> = {
  claude: {
    name: "Claude",
    company: "Anthropic",
    prefix: "@claude",
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyPrefix: "sk-ant-",
    billingUrl: "https://console.anthropic.com/settings/billing",
    chatUrl: "https://claude.ai/new",
    signInUrl: "https://claude.ai/login",
    planName: "Claude Pro or Max",
    billingNote:
      "Anthropic doesn't let other apps use Claude Pro or Max plans, so Relay uses an API key from the Claude Console. Usage bills to that Console account.",
  },
  gpt: {
    name: "ChatGPT",
    company: "OpenAI",
    prefix: "@gpt",
    keyUrl: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
    billingUrl: "https://platform.openai.com/settings/organization/billing/overview",
    chatUrl: "https://chatgpt.com/",
    signInUrl: "https://chatgpt.com/auth/login",
    planName: "ChatGPT",
    billingNote:
      "ChatGPT Plus doesn't include API access, so Relay uses an OpenAI API key. Usage bills to your OpenAI API account.",
  },
  perplexity: {
    name: "Perplexity",
    company: "Perplexity",
    prefix: "@web",
    keyUrl: "https://console.perplexity.ai/project/keys",
    keyPrefix: "pplx-",
    billingUrl: "https://console.perplexity.ai",
    chatUrl: "https://www.perplexity.ai/",
    signInUrl: "https://www.perplexity.ai/",
    planName: "Perplexity",
    billingNote:
      "Relay uses an API key from the Perplexity API console. Usage bills to that account.",
  },
};

/** Guesses the provider from a key's prefix: sk-ant- (Anthropic), pplx- (Perplexity), sk- (OpenAI). */
export function detectKeyProvider(key: string): ModelId | null {
  const k = key.trim();
  if (k.startsWith("sk-ant-")) return "claude";
  if (k.startsWith("pplx-")) return "perplexity";
  if (/^sk-[A-Za-z0-9_-]{16,}$/.test(k)) return "gpt";
  return null;
}

export interface AiAccountDTO {
  provider: ModelId;
  connected: boolean;
  /**
   * "browser": Relay is signed in to the provider's app in its browser, so threads land in the
   * person's own history on their subscription. "key": their API key, billed per token.
   */
  mode: "browser" | "key";
  /** "…a1b2" when connected. */
  hint: string | null;
  /** The provider rejected the key while Relay was using it. */
  invalid: boolean;
  connectedAt: string | null;
}

/** "rejected": the provider refused the key. "no_credit": the key works but the account can't pay. */
export type KeyProblem = "rejected" | "no_credit";

/** A request made with a person's own key failed because of the key or its account. */
export class ProviderKeyError extends Error {
  readonly provider: ModelId;
  readonly problem: KeyProblem;
  constructor(provider: ModelId, problem: KeyProblem = "rejected") {
    super(problem === "rejected" ? `The ${provider} API key was rejected` : `The ${provider} API account has no credit`);
    this.name = "ProviderKeyError";
    this.provider = provider;
    this.problem = problem;
  }
}

// ── Relay's computer: tasks Relay does in its own web browser ─────────────

export type ComputerTaskState =
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_user"
  | "done"
  | "failed"
  | "canceled";

export interface ComputerStepDTO {
  id: string;
  /** "action" | "note" | "approval" | "handoff" | "question" | "answer" | "result" */
  kind: string;
  text: string;
  createdAt: string;
}

export interface ComputerTaskDTO {
  id: string;
  goal: string;
  /** "browse": Relay drives. "signin": the person signs in to a site themselves. */
  mode: "browse" | "signin";
  state: ComputerTaskState;
  /** While waiting_user: a question to answer, or the browser to take over. */
  waitingKind: "answer" | "takeover" | null;
  waitingFor: string | null;
  /** The approval Relay is waiting on, while waiting_approval. */
  action: ActionDTO | null;
  url: string | null;
  title: string | null;
  summary: string | null;
  error: string | null;
  /** Changes whenever the screen does. Use it to refresh the screenshot. */
  screenVersion: string | null;
  createdAt: string;
  endedAt: string | null;
  steps: ComputerStepDTO[];
}

export const COMPUTER_TASK_ACTIVE: ComputerTaskState[] = ["queued", "running", "waiting_approval", "waiting_user"];

/** Browser size while Relay drives, and while the person takes over from a phone. */
export const COMPUTER_VIEWPORT = { width: 1280, height: 800 } as const;
export const TAKEOVER_VIEWPORT = { width: 390, height: 844 } as const;

export type ComputerKey = "Enter" | "Tab" | "Backspace" | "Escape";

/** What the person does while they control the browser. Coordinates are page pixels. */
export type ComputerInput =
  | { type: "click"; x: number; y: number }
  | { type: "type"; text: string }
  | { type: "key"; key: ComputerKey }
  | { type: "scroll"; direction: "up" | "down" }
  | { type: "navigate"; url: string }
  | { type: "back" };
