import {
  approvalGate,
  confirmationPrompt,
  loadHistory,
  loadUserContext,
  parseRoute,
  runAgent,
  smsSystem,
  toolsFor,
  webRouteSystem,
  type AgentTurn,
} from "@relay/agent";
import {
  acquireLock,
  browserAccounts,
  fromDbModel,
  keyProblemMessage,
  loadKeyRing,
  log,
  markModelKeyInvalid,
  MODEL_LABELS,
  noAccessMessage,
  pushComputerSignal,
  recordUsage,
  startChatTask as startComputerChat,
  taskAwaitingAnswer,
  textUser,
  toDbModel,
  UserError,
  type TurnJob,
} from "@relay/core";
import { getPrisma } from "@relay/db";
import { getProvider, perplexity, type Citation, type Usage } from "@relay/providers";
import { NotConfiguredError, ProviderKeyError, type ModelId } from "@relay/types";
import { DelayedError, type Job } from "bullmq";

/** One agent turn at a time per person, so replies and history stay in order. */
export async function processTurn(job: Job<TurnJob>, token?: string): Promise<void> {
  const lock = await acquireLock(`turn:${job.data.userId}`, 3 * 60_000);
  if (!lock) {
    await job.moveToDelayed(Date.now() + 1500, token);
    throw new DelayedError();
  }
  try {
    await smsTurn(job);
  } finally {
    await lock.release();
  }
}

export function withSources(text: string, citations: Citation[]): string {
  const urls = citations.slice(0, 2).map((c) => c.url);
  return urls.length ? `${text}\n\nSources:\n${urls.join("\n")}` : text;
}

export function composeReply(turn: AgentTurn): string {
  const parts: string[] = [];
  if (turn.text) parts.push(turn.text);
  if (turn.pending.length) parts.push(confirmationPrompt(turn.pending));
  if (parts.length) return parts.join("\n\n");
  if (turn.incomplete === "refusal") return "I can't help with that one.";
  return "Sorry, I couldn't finish that. Try asking another way.";
}

async function smsTurn(job: Job<TurnJob>): Promise<void> {
  const prisma = getPrisma();
  const inbound = await prisma.message.findUnique({
    where: { id: job.data.messageId },
    include: { conversation: { include: { user: true } } },
  });
  if (!inbound || inbound.handledAt) return;
  const { conversation } = inbound;
  const user = conversation.user;
  if (user.smsOptOutAt) return;

  // Everything they've sent that Relay hasn't answered. A burst of texts gets one reply, from the
  // job for the newest one.
  const batch = await prisma.message.findMany({
    where: { conversationId: conversation.id, direction: "INBOUND", handledAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (batch.at(-1)?.id !== inbound.id) return;

  const input = batch.map((m) => m.content).join("\n");
  const markHandled = () =>
    prisma.message.updateMany({
      where: { id: { in: batch.map((m) => m.id) } },
      data: { handledAt: new Date() },
    });
  const reply = (body: string, extra: { model?: ModelId; metadata?: Record<string, unknown> } = {}) =>
    textUser({
      user,
      body,
      conversationId: conversation.id,
      ...(extra.model ? { model: toDbModel(extra.model) } : {}),
      metadata: { kind: "reply", ...extra.metadata },
    });

  // A browser task asked a question: this text is the answer (or a request to stop).
  const waiting = await taskAwaitingAnswer(user.id);
  if (waiting && !/^@\w/.test(input.trim())) {
    const stop = /^(cancel|stop|never ?mind)( it| that| the task)?[.!]*$/i.test(input.trim());
    await pushComputerSignal(waiting.id, stop ? { type: "cancel" } : { type: "answer", text: input });
    await markHandled();
    await reply(stop ? "Stopped." : "Got it.");
    return;
  }

  const route = parseRoute(input, fromDbModel(user.defaultModel));
  if (!route.text) {
    await markHandled();
    await reply('Add your question after the prefix, like "@web is Costco open today?"');
    return;
  }

  // Providers they signed in to: the message goes into their own account, in their own history.
  if ((await browserAccounts(user.id)).includes(route.model)) {
    await markHandled();
    try {
      await startComputerChat(user.id, { provider: route.model, message: route.text, conversationId: conversation.id });
    } catch (err) {
      await reply(err instanceof UserError ? err.message : "Something went wrong reaching your account. Try again in a minute.");
    }
    return;
  }

  // The person's own key when they've connected one, otherwise Relay's (within today's cap).
  const ring = await loadKeyRing(user.id, user.timezone);
  const credential = ring.credential(route.model);
  if (credential.source === "none") {
    await markHandled();
    await reply(noAccessMessage(route.model, credential.reason));
    return;
  }
  const key = credential.source === "user" ? { apiKey: credential.apiKey } : {};

  const now = new Date();
  const [{ context, hasGoogle }, history] = await Promise.all([
    loadUserContext(user, now),
    loadHistory(user.id, batch[0]!.createdAt),
  ]);
  const onUsage = (provider: ModelId, usage: Usage, model: string) =>
    recordUsage({ userId: user.id, provider, model, channel: "SMS", byok: ring.byok(provider), ...usage });
  const onKeyProblem = async (err: ProviderKeyError) => {
    if (err.problem === "rejected") await markModelKeyInvalid(user.id, err.provider);
  };

  let body: string;
  let metadata: Record<string, unknown> = {};
  try {
    if (route.model === "perplexity") {
      const res = await perplexity.complete({
        ...key,
        system: webRouteSystem(context),
        messages: [...history, { role: "user", content: route.text }],
        maxTokens: 1500,
      });
      await onUsage("perplexity", res.usage, res.model);
      const citations = res.citations ?? [];
      body = withSources(res.text || "I couldn't find an answer to that.", citations);
      metadata = { citations: citations.slice(0, 5) };
    } else {
      const turn = await runAgent({
        provider: getProvider(route.model),
        ...key,
        system: smsSystem(context),
        history,
        input: route.text,
        tools: toolsFor({ channel: "sms", hasGoogle, webSearch: ring.keyFor("perplexity") !== null }),
        ctx: {
          userId: user.id,
          userName: user.name,
          phone: user.phone,
          timezone: user.timezone,
          channel: "sms",
          conversationId: conversation.id,
          sourceMessageId: inbound.id,
          now,
          hasGoogle,
          onUsage,
          keyFor: ring.keyFor,
          onKeyProblem,
        },
        requestApproval: approvalGate({
          userId: user.id,
          channel: "SMS",
          conversationId: conversation.id,
          pinSet: Boolean(user.pinHash),
        }),
      });
      body = composeReply(turn);
      metadata = {
        tools: turn.toolsUsed,
        ...(turn.pending.length ? { actionIds: turn.pending.map((p) => p.actionId) } : {}),
        ...(turn.citations.length ? { citations: turn.citations.slice(0, 5) } : {}),
        ...(turn.incomplete ? { incomplete: turn.incomplete } : {}),
      };
    }
  } catch (err) {
    if (err instanceof ProviderKeyError) {
      await onKeyProblem(err);
      await markHandled();
      await reply(keyProblemMessage(err.provider, err.problem));
      return;
    }
    if (err instanceof NotConfiguredError) {
      log.error({ err, model: route.model }, "model provider not configured");
      await markHandled();
      const others = (["claude", "gpt", "web"] as const)
        .filter((p) => p !== (route.model === "perplexity" ? "web" : route.model))
        .map((p) => `@${p}`);
      await reply(`${MODEL_LABELS[route.model]} isn't available right now. Try ${others.join(" or ")}.`);
      return;
    }
    const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (finalAttempt) {
      await markHandled();
      await reply("Sorry, something went wrong on my end. Try again in a minute.");
    }
    throw err;
  }

  await markHandled();
  await reply(body, { model: route.model, metadata });
}
