import { aiAccounts, dailySpend, env, fromDbModel, GOOGLE_SCOPES, includedModels, isRecurrence } from "@relay/core";
import { getPrisma, type Action, type ComputerStep, type ComputerTask, type Conversation, type Memory, type Message, type Reminder, type User } from "@relay/db";
import type {
  ActionDTO,
  ActionState,
  ComputerTaskDTO,
  ComputerTaskState,
  HistoryItemDTO,
  MeDTO,
  MemoryDTO,
  ReminderDTO,
} from "@relay/types";

const STATE: Record<Action["status"], ActionState> = {
  PENDING: "pending",
  AWAITING_CONFIRMATION: "pending",
  CONFIRMED: "approved",
  DENIED: "denied",
  EXPIRED: "expired",
  RUNNING: "running",
  SUCCEEDED: "done",
  FAILED: "failed",
};

export function toActionDTO(a: Action): ActionDTO {
  const expired = a.status === "AWAITING_CONFIRMATION" && a.expiresAt !== null && a.expiresAt < new Date();
  return {
    id: a.id,
    type: a.type,
    state: expired ? "expired" : STATE[a.status],
    summary: a.summary,
    risk: a.risk.toLowerCase() as ActionDTO["risk"],
    requiresPin: a.requiresPin,
    tainted: a.tainted,
    channel: a.channel === "VOICE" ? "voice" : "sms",
    createdAt: a.createdAt.toISOString(),
    expiresAt: a.expiresAt?.toISOString() ?? null,
    completedAt: a.completedAt?.toISOString() ?? null,
    error: a.error,
  };
}

export function toHistoryItem(m: Message & { conversation: Conversation }): HistoryItemDTO {
  const callOut = m.conversation.direction === "OUTBOUND";
  return {
    id: m.id,
    conversationId: m.conversationId,
    channel: m.conversation.channel === "VOICE" ? "voice" : "sms",
    callOut,
    // On calls Relay places, the other party is a business, not the user.
    from: m.role === "ASSISTANT" ? "relay" : callOut ? "other" : "user",
    content: m.content,
    model: m.model ? fromDbModel(m.model) : null,
    createdAt: m.createdAt.toISOString(),
  };
}

export function toMemoryDTO(m: Memory): MemoryDTO {
  return { id: m.id, fact: m.fact, createdAt: m.createdAt.toISOString() };
}

export function toReminderDTO(r: Reminder): ReminderDTO {
  return {
    id: r.id,
    body: r.body,
    runAt: r.runAt.toISOString(),
    recurrence: isRecurrence(r.recurrence) ? r.recurrence : null,
    sentAt: r.sentAt?.toISOString() ?? null,
  };
}

export async function toMeDTO(user: User): Promise<MeDTO> {
  const prisma = getPrisma();
  const now = new Date();
  const [google, spend, pendingActions, memories, upcomingReminders, accounts] = await Promise.all([
    prisma.connection.findUnique({
      where: { userId_provider: { userId: user.id, provider: "GOOGLE" } },
      select: { accountEmail: true, scopes: true },
    }),
    dailySpend(user.id, user.timezone),
    prisma.action.count({
      where: { userId: user.id, status: "AWAITING_CONFIRMATION", expiresAt: { gt: now } },
    }),
    prisma.memory.count({ where: { userId: user.id } }),
    prisma.reminder.count({
      where: { userId: user.id, OR: [{ sentAt: null }, { recurrence: { not: null } }] },
    }),
    aiAccounts(user.id),
  ]);
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    timezone: user.timezone,
    defaultModel: fromDbModel(user.defaultModel),
    hasPin: Boolean(user.pinHash),
    pinLocked: Boolean(user.pinLockedUntil && user.pinLockedUntil > now),
    smsOptedOut: Boolean(user.smsOptOutAt),
    relayNumber: env().TWILIO_PHONE_NUMBER ?? null,
    google: {
      connected: Boolean(google),
      email: google?.accountEmail ?? null,
      missingScopes: google ? Object.values(GOOGLE_SCOPES).some((s) => !google.scopes.includes(s)) : false,
    },
    aiAccounts: accounts,
    includedModels: includedModels(),
    usage: { spentCents: Math.round(spend.spentCents * 100) / 100, capCents: spend.capCents },
    counts: { pendingActions, memories, upcomingReminders },
    createdAt: user.createdAt.toISOString(),
  };
}

const TASK_STATE: Record<ComputerTask["status"], ComputerTaskState> = {
  QUEUED: "queued",
  RUNNING: "running",
  WAITING_APPROVAL: "waiting_approval",
  WAITING_USER: "waiting_user",
  SUCCEEDED: "done",
  FAILED: "failed",
  CANCELED: "canceled",
};

export function toComputerTaskDTO(
  t: ComputerTask,
  extra: { steps?: ComputerStep[]; action?: Action | null; screenVersion?: string | null } = {},
): ComputerTaskDTO {
  return {
    id: t.id,
    goal: t.goal,
    mode: t.mode === "signin" ? "signin" : "browse",
    state: TASK_STATE[t.status],
    waitingKind: t.status === "WAITING_USER" && (t.waitingKind === "answer" || t.waitingKind === "takeover") ? t.waitingKind : null,
    waitingFor: t.waitingFor,
    action: extra.action && t.status === "WAITING_APPROVAL" ? toActionDTO(extra.action) : null,
    url: t.url,
    title: t.title,
    summary: t.summary,
    error: t.error ? "failed" : null,
    screenVersion: extra.screenVersion ?? null,
    createdAt: t.createdAt.toISOString(),
    endedAt: t.endedAt?.toISOString() ?? null,
    steps: (extra.steps ?? []).map((s) => ({ id: s.id, kind: s.kind, text: s.text, createdAt: s.createdAt.toISOString() })),
  };
}
