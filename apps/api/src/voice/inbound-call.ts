import {
  approvalGate,
  confirmationPrompt,
  loadHistory,
  loadUserContext,
  parseSpokenRoute,
  runAgent,
  toolsFor,
  voiceSystem,
  voiceWebSystem,
  type PendingApproval,
} from "@relay/agent";
import {
  addMessage,
  checkPin,
  confirmActions,
  dailySpend,
  denyActions,
  fromDbModel,
  recordUsage,
  textUser,
  toDbModel,
} from "@relay/core";
import { getPrisma, type Conversation, type User } from "@relay/db";
import { getProvider, perplexity, type AgentMessage, type Usage } from "@relay/providers";
import type { ModelId } from "@relay/types";
import type { FastifyBaseLogger } from "fastify";
import { isCancel, spokenDigits, type RelaySocket, type SetupMessage } from "./relay.js";

const MAX_CALL_MS = 20 * 60_000;
const PIN_TRIES_PER_CALL = 3;
const DIGIT_PAUSE_MS = 2500;

/** One inbound call: the person talking to Relay. */
export class InboundCall {
  private user!: User;
  private conversation!: Conversation;
  private history: AgentMessage[] = [];
  /** Caller ID passed STIR/SHAKEN "A" attestation, or the caller entered their PIN. */
  private verified = false;
  private pending: PendingApproval[] = [];
  private pinTries = 0;
  private digits = "";
  private digitTimer: NodeJS.Timeout | undefined;
  private callTimer: NodeJS.Timeout | undefined;
  private abort: AbortController | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly relay: RelaySocket,
    private readonly log: FastifyBaseLogger,
  ) {}

  async start(setup: SetupMessage): Promise<boolean> {
    const conversation = await getPrisma().conversation.findUnique({
      where: { callSid: setup.callSid },
      include: { user: true },
    });
    if (!conversation || conversation.id !== setup.customParameters?.conversationId) return false;
    this.conversation = conversation;
    this.user = conversation.user;
    this.verified = setup.customParameters?.verified === "1";
    this.history = await loadHistory(this.user.id, conversation.startedAt);
    const greeting = setup.customParameters?.greeting;
    if (greeting) this.history.push({ role: "assistant", content: greeting });
    this.callTimer = setTimeout(() => {
      this.relay.say("We've reached the time limit for one call. Call back anytime.");
      setTimeout(() => this.relay.end({ reason: "time_limit" }), 4000);
    }, MAX_CALL_MS);
    return true;
  }

  /** Utterances are handled one at a time, in order. */
  onPrompt(text: string): void {
    this.queue = this.queue
      .then(() => this.handleUtterance(text))
      .catch((err: unknown) => {
        this.log.error({ err }, "voice turn failed");
        this.relay.say("Sorry, I hit a snag. Could you say that again?");
      });
  }

  onInterrupt(): void {
    this.abort?.abort();
  }

  onDigit(digit: string): void {
    clearTimeout(this.digitTimer);
    if (digit === "#") {
      void this.submitDigits();
      return;
    }
    if (/^\d$/.test(digit)) this.digits += digit;
    this.digitTimer = setTimeout(() => void this.submitDigits(), DIGIT_PAUSE_MS);
  }

  async close(): Promise<void> {
    clearTimeout(this.callTimer);
    clearTimeout(this.digitTimer);
    this.abort?.abort();
    if (this.conversation) {
      await getPrisma().conversation.update({
        where: { id: this.conversation.id },
        data: { endedAt: new Date() },
      });
    }
  }

  private async persist(role: "USER" | "ASSISTANT", content: string, model?: ModelId): Promise<void> {
    if (!content.trim()) return;
    await addMessage({
      conversationId: this.conversation.id,
      direction: role === "USER" ? "INBOUND" : "OUTBOUND",
      role,
      content,
      ...(model ? { model: toDbModel(model) } : {}),
      // Voice turns are answered live, so they never wait for the SMS worker.
      ...(role === "USER" ? { metadata: { kind: "voice" } } : {}),
    });
    if (role === "USER") {
      await getPrisma().message.updateMany({
        where: { conversationId: this.conversation.id, handledAt: null, direction: "INBOUND" },
        data: { handledAt: new Date() },
      });
    }
  }

  private async submitDigits(): Promise<void> {
    const pin = this.digits;
    this.digits = "";
    if (pin.length < 4) return;
    if (this.pending.length) {
      await this.approveWithPin(pin);
    } else if (!this.verified && this.user.pinHash) {
      await this.unlock(pin);
    }
  }

  private async freshUser(): Promise<User> {
    this.user = await getPrisma().user.findUniqueOrThrow({ where: { id: this.user.id } });
    return this.user;
  }

  private async unlock(pin: string): Promise<void> {
    const check = await checkPin(await this.freshUser(), pin);
    if (check === "ok") {
      this.verified = true;
      this.relay.say("Thanks, you're verified. Email and calendar are available on this call.");
    } else if (check === "locked") {
      this.relay.say("Your PIN is locked for an hour after too many tries.");
    } else {
      this.relay.say("That PIN didn't match.");
    }
  }

  private async approveWithPin(pin: string): Promise<void> {
    const ids = this.pending.map((p) => p.actionId);
    const check = await checkPin(await this.freshUser(), pin);
    if (check === "ok") {
      this.pending = [];
      this.verified = true;
      const confirmed = await confirmActions(this.user.id, ids);
      this.relay.say(
        confirmed.length
          ? "Confirmed. I'll text you when it's done."
          : "That request expired. Ask me again if you still want it.",
      );
      return;
    }
    this.pinTries += 1;
    if (check === "locked" || this.pinTries >= PIN_TRIES_PER_CALL) {
      this.pending = [];
      await denyActions(this.user.id, ids);
      this.relay.say(
        check === "locked"
          ? "Your PIN is locked for an hour after too many tries, so I canceled that."
          : "That didn't match, so I canceled it. You can approve it from the Relay app instead.",
      );
      return;
    }
    this.relay.say("That didn't match. Try your PIN again.");
  }

  private async handleUtterance(text: string): Promise<void> {
    // While waiting for a PIN, speech goes to the PIN check and is never stored or sent to a model.
    if (this.pending.length) {
      if (isCancel(text) && spokenDigits(text).length < 4) {
        await denyActions(this.user.id, this.pending.map((p) => p.actionId));
        this.pending = [];
        this.relay.say("Okay, I canceled that.");
        return;
      }
      const pin = spokenDigits(text);
      if (pin.length >= 4) return this.approveWithPin(pin);
      this.relay.say("I didn't catch a PIN. Say it one digit at a time, or use the keypad.");
      return;
    }

    const user = await this.freshUser();
    const spend = await dailySpend(user.id, user.timezone);
    if (spend.over) {
      this.relay.say("You've reached today's usage limit. It resets at midnight. Talk soon.");
      setTimeout(() => this.relay.end({ reason: "spend_cap" }), 5000);
      return;
    }

    await this.persist("USER", text);
    const route = parseSpokenRoute(text, fromDbModel(user.defaultModel));
    const { context, hasGoogle } = await loadUserContext(user);
    if (!this.verified) context.memories = [];
    context.callerVerified = this.verified;
    context.hasPin = Boolean(user.pinHash);

    const onUsage = (provider: ModelId, usage: Usage, model: string) =>
      recordUsage({ userId: user.id, provider, model, channel: "VOICE", ...usage });

    this.abort = new AbortController();
    const signal = this.abort.signal;
    let spoken = "";
    let spokeThisStep = false;
    const speak = (delta: string) => {
      spoken += delta;
      spokeThisStep = true;
      this.relay.text(delta);
    };

    let endCall = false;
    let model: ModelId = route.model;
    try {
      if (route.model === "perplexity") {
        const res = await perplexity.complete({
          system: voiceWebSystem(context),
          messages: [...this.history, { role: "user", content: route.text }],
          onText: speak,
          signal,
          maxTokens: 600,
        });
        await onUsage("perplexity", res.usage, res.model);
      } else {
        model = route.model;
        const turn = await runAgent({
          provider: getProvider(route.model),
          tier: "fast",
          system: voiceSystem(context),
          history: this.history,
          input: route.text,
          tools: toolsFor({ channel: "voice", hasGoogle, callerVerified: this.verified }),
          ctx: {
            userId: user.id,
            userName: user.name,
            phone: user.phone,
            timezone: user.timezone,
            channel: "voice",
            conversationId: this.conversation.id,
            now: new Date(),
            hasGoogle,
            onUsage,
          },
          requestApproval: approvalGate({
            userId: user.id,
            channel: "VOICE",
            conversationId: this.conversation.id,
            pinSet: Boolean(user.pinHash),
          }),
          onText: speak,
          onToolStart: () => {
            if (!spokeThisStep) speak("One sec. ");
            spokeThisStep = false;
          },
          signal,
          maxSteps: 5,
          maxTokens: 2000,
        });
        endCall = turn.effects.some((e) => e.data.endCall === true);

        if (turn.pending.length) {
          if (user.pinHash) {
            this.pending = turn.pending;
            this.pinTries = 0;
            speak(" To confirm, say your PIN or enter it on the keypad.");
          } else {
            await textUser({ user, body: confirmationPrompt(turn.pending), metadata: { kind: "confirm" } });
            speak(" I've texted you the details. Reply YES to approve it.");
          }
        } else if (!spoken.trim()) {
          speak(turn.incomplete === "refusal" ? "I can't help with that one." : "Sorry, I didn't get that. Could you rephrase?");
        }
      }
    } catch (err) {
      if (!signal.aborted) throw err;
    } finally {
      this.relay.text("", true);
    }

    this.history.push({ role: "user", content: route.text });
    if (spoken.trim()) {
      this.history.push({ role: "assistant", content: spoken.trim() });
      await this.persist("ASSISTANT", spoken.trim(), model);
    }
    if (endCall) setTimeout(() => this.relay.end({ reason: "goodbye" }), 1500);
  }
}
