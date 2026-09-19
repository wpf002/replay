import {
  CALL_SUMMARY_SYSTEM,
  callModel,
  outboundCallSystem,
  outboundCallTools,
  placeCall,
  runAgent,
  type CALL_OUTCOMES,
} from "@relay/agent";
import {
  addMessage,
  formatPhone,
  fromDbModel,
  keyProblemMessage,
  loadKeyRing,
  markModelKeyInvalid,
  recordUsage,
  settleRunningAction,
  toDbModel,
  type KeyRing,
} from "@relay/core";
import { getPrisma, type Action, type Conversation, type User } from "@relay/db";
import { getProvider, type AgentMessage, type Usage } from "@relay/providers";
import { ProviderKeyError, type ModelId } from "@relay/types";
import type { FastifyBaseLogger } from "fastify";
import type { z } from "zod";
import type { RelaySocket, SetupMessage } from "./relay.js";

const MAX_CALL_MS = 8 * 60_000;
/** If nobody speaks after the call connects, Relay opens. */
const OPENER_DELAY_MS = 4000;

type Outcome = (typeof CALL_OUTCOMES)[number];
type Brief = z.infer<typeof placeCall.input>;

const SUCCESS: Record<Outcome, boolean> = {
  booked: true,
  done: true,
  declined: false,
  no_answer: false,
  needs_you: false,
};

/** Relay on the phone with a business, working an approved place_call action. */
export class OutboundCall {
  private conversation!: Conversation;
  private action!: Action;
  private user!: User;
  private brief!: Brief;
  private history: AgentMessage[] = [];
  private finished = false;
  private queue: Promise<void> = Promise.resolve();
  private openerTimer: NodeJS.Timeout | undefined;
  private callTimer: NodeJS.Timeout | undefined;
  private abort: AbortController | undefined;
  private ring!: KeyRing;
  /** Claude or ChatGPT, on the person's key when they've connected one. */
  private model!: NonNullable<ReturnType<typeof callModel>>;

  constructor(
    private readonly relay: RelaySocket,
    private readonly log: FastifyBaseLogger,
  ) {}

  async start(setup: SetupMessage): Promise<boolean> {
    const conversation = await getPrisma().conversation.findUnique({
      where: { callSid: setup.callSid },
      include: { user: true, action: true },
    });
    if (!conversation?.action || conversation.id !== setup.customParameters?.conversationId) return false;
    this.conversation = conversation;
    this.user = conversation.user;
    this.action = conversation.action;
    this.brief = placeCall.input.parse(conversation.action.payload);
    this.ring = await loadKeyRing(this.user.id, this.user.timezone);
    const model = callModel(this.ring.keyFor, fromDbModel(this.user.defaultModel));
    if (!model) {
      this.finished = true;
      await settleRunningAction(this.action.id, {
        ok: false,
        message: `${this.brief.businessName}: I couldn't make the call. Connect Claude or ChatGPT in the Relay app first.`,
      });
      return false;
    }
    this.model = model;

    this.openerTimer = setTimeout(() => this.onPrompt(""), OPENER_DELAY_MS);
    this.callTimer = setTimeout(() => {
      void this.finish("needs_you", `The call to ${this.brief.businessName} ran long, so I hung up before it was settled.`);
    }, MAX_CALL_MS);
    return true;
  }

  onPrompt(text: string): void {
    clearTimeout(this.openerTimer);
    this.queue = this.queue
      .then(() => this.respond(text))
      .catch((err: unknown) => this.log.error({ err }, "outbound call turn failed"));
  }

  onInterrupt(): void {
    this.abort?.abort();
  }

  onDigit(): void {
    // The business pressing keys means nothing to us.
  }

  async close(): Promise<void> {
    clearTimeout(this.openerTimer);
    clearTimeout(this.callTimer);
    this.abort?.abort();
    if (!this.conversation) return;
    await getPrisma().conversation.update({
      where: { id: this.conversation.id },
      data: { endedAt: new Date() },
    });
    // They hung up before Relay called finish_call. Summarize what happened.
    if (!this.finished) {
      this.finished = true;
      const summary = await this.summarize().catch(() => null);
      await settleRunningAction(this.action.id, {
        ok: false,
        message: `${this.brief.businessName}: ${summary ?? "the call ended before anything was settled."}`,
      });
    }
  }

  private onUsage = (provider: ModelId, usage: Usage, model: string) =>
    recordUsage({ userId: this.user.id, provider, model, channel: "VOICE", byok: this.ring.byok(provider), ...usage });

  private onKeyProblem = async (err: ProviderKeyError) => {
    if (err.problem === "rejected") await markModelKeyInvalid(this.user.id, err.provider);
  };

  private async persist(from: "business" | "relay", content: string): Promise<void> {
    if (!content.trim()) return;
    await addMessage({
      conversationId: this.conversation.id,
      direction: from === "business" ? "INBOUND" : "OUTBOUND",
      role: from === "business" ? "USER" : "ASSISTANT",
      content,
      ...(from === "relay" ? { model: toDbModel(this.model.provider) } : {}),
    });
  }

  private async respond(heard: string): Promise<void> {
    if (this.finished) return;
    if (heard) await this.persist("business", heard);
    const input = heard || "(The call connected. Nobody has spoken yet, so open the conversation.)";

    this.abort = new AbortController();
    let spoken = "";
    try {
      const turn = await runAgent({
        provider: getProvider(this.model.provider),
        ...this.model.key,
        tier: "fast",
        system: outboundCallSystem({
          clientName: this.user.name ?? "my client",
          businessName: this.brief.businessName,
          goal: this.brief.goal,
          flexibility: this.brief.flexibility,
          nameForBooking: this.brief.nameForBooking,
          callbackNumber: this.brief.shareCallbackNumber ? formatPhone(this.user.phone) : undefined,
          now: new Date(),
          timezone: this.user.timezone,
        }),
        history: this.history,
        input,
        tools: outboundCallTools,
        ctx: {
          userId: this.user.id,
          userName: this.user.name,
          phone: this.user.phone,
          timezone: this.user.timezone,
          channel: "voice",
          conversationId: this.conversation.id,
          now: new Date(),
          hasGoogle: false,
          onUsage: this.onUsage,
          keyFor: this.ring.keyFor,
          onKeyProblem: this.onKeyProblem,
        },
        requestApproval: () => {
          throw new Error("No approvals during a business call");
        },
        onText: (delta) => {
          spoken += delta;
          this.relay.text(delta);
        },
        signal: this.abort.signal,
        maxSteps: 3,
        maxTokens: 1500,
      });

      for (const effect of turn.effects) {
        if (typeof effect.data.digits === "string") this.relay.sendDigits(effect.data.digits);
      }
      const finish = turn.effects.find((e) => e.data.finish)?.data.finish as
        | { outcome: Outcome; summary: string }
        | undefined;
      if (finish) await this.finish(finish.outcome, finish.summary);
    } catch (err) {
      if (err instanceof ProviderKeyError) {
        await this.onKeyProblem(err);
        await this.finish("needs_you", `I had to hang up: ${keyProblemMessage(err.provider, err.problem)}`);
      } else if (!this.abort.signal.aborted) throw err;
    } finally {
      this.relay.text("", true);
    }

    this.history.push({ role: "user", content: input });
    if (spoken.trim()) {
      this.history.push({ role: "assistant", content: spoken.trim() });
      await this.persist("relay", spoken.trim());
    }
  }

  private async finish(outcome: Outcome, summary: string): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.callTimer);
    await settleRunningAction(this.action.id, {
      ok: SUCCESS[outcome],
      message: `${this.brief.businessName}: ${summary}`,
      data: { outcome, summary },
    });
    // Let the goodbye finish playing before hanging up.
    setTimeout(() => this.relay.end({ outcome }), 2500);
  }

  private async summarize(): Promise<string | null> {
    const transcript = await getPrisma().message.findMany({
      where: { conversationId: this.conversation.id },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });
    if (!transcript.length) return null;
    const lines = transcript.map((m) => `${m.role === "USER" ? this.brief.businessName : "Relay"}: ${m.content}`);
    const res = await getProvider(this.model.provider).complete({
      ...this.model.key,
      tier: "fast",
      system: { stable: CALL_SUMMARY_SYSTEM },
      messages: [{ role: "user", content: `Goal: ${this.brief.goal}\n\nTranscript:\n${lines.join("\n")}` }],
      maxTokens: 300,
    });
    await this.onUsage(this.model.provider, res.usage, res.model);
    return res.text || null;
  }
}
