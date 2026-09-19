import Anthropic from "@anthropic-ai/sdk";
import { confirmationPrompt } from "@relay/agent";
import {
  acquireLock,
  addComputerStep,
  browserProfileDir,
  env,
  keyProblemMessage,
  loadKeyRing,
  log,
  markModelKeyInvalid,
  need,
  noAccessMessage,
  recordUsage,
  redis,
  saveScreen,
  signalKey,
  textUser,
  type ComputerJob,
  type ComputerSignal,
} from "@relay/core";
import { getPrisma, type ComputerTask, type ComputerTaskStatus, type User } from "@relay/db";
import { costMicros, keyProblem, OFFICIAL_BASE_URL, parsePrice } from "@relay/providers";
import { COMPUTER_VIEWPORT, TAKEOVER_VIEWPORT } from "@relay/types";
import { DelayedError, type Job } from "bullmq";
import { rm } from "node:fs/promises";
import { RelayBrowser } from "./browser.js";
import { runComputerLoop, type Outcome } from "./loop.js";
import { COMPUTER_SYSTEM, computerContext } from "./prompt.js";

/** How long Relay waits for an approval, an answer, or the person to finish a sign-in. */
const WAIT_MS = 30 * 60_000;
/** Covers a long task plus several waits; the browser profile is locked for this long at most. */
const LOCK_MS = 3 * 60 * 60_000;
const APPROVAL_EXPIRY_MS = 30 * 60_000;

// Models that support browser_toolset_20260801.
const TOOLSET_MODELS = /^claude-(opus-5|sonnet-5|fable-5|mythos-5|opus-4-8)/;

export function computerModel(): string {
  const e = env();
  if (e.COMPUTER_MODEL) return e.COMPUTER_MODEL;
  return e.CLAUDE_MODEL && TOOLSET_MODELS.test(e.CLAUDE_MODEL) ? e.CLAUDE_MODEL : "claude-sonnet-5";
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Reads signals for one task on its own connection, since BLPOP blocks it. */
class Signals {
  private readonly conn = redis().duplicate();
  constructor(private readonly taskId: string) {}

  async next(timeoutS: number): Promise<ComputerSignal | null> {
    const res = await this.conn.blpop(signalKey(this.taskId), timeoutS);
    if (!res) return null;
    try {
      return JSON.parse(res[1]) as ComputerSignal;
    } catch {
      return null;
    }
  }

  /** While Relay is working, only a cancel matters; anything else queued is stale. */
  async cancelled(): Promise<boolean> {
    let cancel = false;
    for (;;) {
      const raw = await this.conn.lpop(signalKey(this.taskId));
      if (!raw) return cancel;
      if (raw.includes('"cancel"')) cancel = true;
    }
  }

  async close(): Promise<void> {
    await this.conn.quit().catch(() => undefined);
  }
}

export async function processComputer(job: Job<ComputerJob>, token?: string): Promise<void> {
  if ("wipeUserId" in job.data) {
    await rm(browserProfileDir(job.data.wipeUserId), { recursive: true, force: true });
    log.info({ userId: job.data.wipeUserId }, "browser profile wiped");
    return;
  }
  const task = await getPrisma().computerTask.findUnique({ where: { id: job.data.taskId }, include: { user: true } });
  if (!task || task.status !== "QUEUED") return;

  // One browser per person: their profile can only be open once.
  const lock = await acquireLock(`browser:${task.userId}`, LOCK_MS);
  if (!lock) {
    await job.moveToDelayed(Date.now() + 5000, token);
    throw new DelayedError();
  }
  try {
    await new TaskRun(task, task.user).run();
  } finally {
    await lock.release();
  }
}

class TaskRun {
  private readonly prisma = getPrisma();
  private readonly signals: Signals;
  private browser: RelayBrowser | null = null;
  private lastUrl = "";

  constructor(
    private readonly task: ComputerTask,
    private readonly user: User,
  ) {
    this.signals = new Signals(task.id);
  }

  private update(data: Parameters<ReturnType<typeof getPrisma>["computerTask"]["update"]>[0]["data"]) {
    return this.prisma.computerTask.update({ where: { id: this.task.id }, data });
  }

  private text(body: string, kind = "task") {
    return textUser({
      user: this.user,
      body,
      ...(this.task.conversationId ? { conversationId: this.task.conversationId } : {}),
      metadata: { kind, taskId: this.task.id },
    });
  }

  private async end(status: ComputerTaskStatus, summary: string, opts: { notify?: boolean; error?: string } = {}) {
    await this.update({ status, summary, endedAt: new Date(), waitingKind: null, waitingFor: null, actionId: null, ...(opts.error ? { error: opts.error } : {}) });
    await addComputerStep(this.task.id, "result", summary);
    if (opts.notify !== false) await this.text(summary);
  }

  /** Publishes the current screen to the live view and keeps the task's URL and title current. */
  private async publishScreen(): Promise<void> {
    if (!this.browser) return;
    try {
      await saveScreen(this.task.id, await this.browser.screenshot(60));
      const url = this.browser.url();
      if (url !== this.lastUrl) {
        this.lastUrl = url;
        await this.update({ url: url.slice(0, 2000), title: (await this.browser.title()).slice(0, 300) });
      }
    } catch (err) {
      log.warn({ err, taskId: this.task.id }, "screenshot failed");
    }
  }

  /**
   * Waits for the person. While they control the browser, their taps and typing are applied as
   * they arrive and the live view refreshes. Their input is never logged or stored.
   */
  private async wait(opts: {
    on?: (s: ComputerSignal) => "done" | null;
    poll?: () => Promise<"done" | "stop" | null>;
    takeover?: boolean;
  }): Promise<"done" | "stop" | "timeout"> {
    const deadline = Date.now() + WAIT_MS;
    let lastShot = 0;
    while (Date.now() < deadline) {
      const signal = await this.signals.next(2);
      if (signal?.type === "cancel") return "stop";
      if (signal?.type === "input") {
        if (opts.takeover && this.browser) {
          await this.browser.apply(signal.input).catch((err: unknown) => log.warn({ err: (err as Error).message }, "takeover input failed"));
          await this.publishScreen();
          lastShot = Date.now();
        }
        continue;
      }
      if (signal && opts.on?.(signal) === "done") return "done";
      const polled = await opts.poll?.();
      if (polled) return polled;
      if (opts.takeover && Date.now() - lastShot > 2500) {
        await this.publishScreen();
        lastShot = Date.now();
      }
    }
    return "timeout";
  }

  async run(): Promise<void> {
    const ring = await loadKeyRing(this.user.id, this.user.timezone);
    const credential = ring.credential("claude");
    if (this.task.mode === "browse" && credential.source === "none") {
      await this.end("FAILED", noAccessMessage("claude", credential.reason), { error: "no_model_access" });
      return;
    }

    await this.update({ status: "RUNNING" });
    try {
      this.browser = await RelayBrowser.open(this.user.id, this.user.timezone);
    } catch (err) {
      log.error({ err, taskId: this.task.id }, "browser failed to start");
      await this.end("FAILED", "Relay's browser couldn't start, so I couldn't do that. Try again in a bit.", { error: "browser_start" });
      return;
    }

    try {
      if (this.task.mode === "signin") await this.signIn();
      else await this.browse(credential.source === "user" ? credential.apiKey : undefined, ring.byok("claude"));
    } catch (err) {
      log.error({ err, taskId: this.task.id }, "computer task failed");
      await this.end("FAILED", "Something went wrong in Relay's browser, so I stopped. Try again in a bit.", { error: (err as Error).message.slice(0, 500) });
    } finally {
      await this.browser.close();
      await this.signals.close();
    }
  }

  /** The person signs in to a site on Relay's browser; the profile keeps them signed in. */
  private async signIn(): Promise<void> {
    const browser = this.browser!;
    const host = hostOf(this.task.startUrl ?? "");
    await browser.setViewport(TAKEOVER_VIEWPORT);
    if (this.task.startUrl) await browser.run("navigate", { url: this.task.startUrl });
    await this.publishScreen();
    await this.update({ status: "WAITING_USER", waitingKind: "takeover", waitingFor: `Sign in to ${host}` });
    await addComputerStep(this.task.id, "handoff", `Waiting for you to sign in to ${host}`);
    const result = await this.wait({ takeover: true, on: (s) => (s.type === "resume" ? "done" : null) });
    if (result === "done") await this.end("SUCCEEDED", `Signed in to ${host}. Relay can use it for tasks now.`, { notify: false });
    else if (result === "stop") await this.end("CANCELED", "Stopped.", { notify: false });
    else await this.end("FAILED", `Sign-in to ${host} timed out.`, { notify: false });
  }

  private async browse(apiKey: string | undefined, byok: boolean): Promise<void> {
    const browser = this.browser!;
    const model = computerModel();
    const price = parsePrice(env().COMPUTER_PRICE ?? env().CLAUDE_PRICE);
    const client = apiKey
      ? new Anthropic({ apiKey, baseURL: OFFICIAL_BASE_URL.claude, maxRetries: 3 })
      : new Anthropic({ apiKey: need("ANTHROPIC_API_KEY"), maxRetries: 3 });
    const memories = await this.prisma.memory.findMany({
      where: { userId: this.user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { fact: true },
    });

    let result: { outcome: Outcome; summary: string };
    try {
      result = await runComputerLoop({
        client,
        model,
        system: COMPUTER_SYSTEM,
        context: computerContext({ name: this.user.name, timezone: this.user.timezone, now: new Date(), memories: memories.map((m) => m.fact) }),
        goal: this.task.goal,
        startUrl: this.task.startUrl,
        browser,
        hooks: {
          step: (kind, text) => addComputerStep(this.task.id, kind, text),
          screen: () => this.publishScreen(),
          stopped: () => this.signals.cancelled(),
          usage: async (u, servedModel) => {
            const cacheWrite = u.cache_creation_input_tokens ?? 0;
            const cacheRead = u.cache_read_input_tokens ?? 0;
            const billedInput = Math.ceil(u.input_tokens + cacheWrite * 1.25 + cacheRead * 0.1);
            const cost = costMicros(price, billedInput, u.output_tokens);
            await recordUsage({
              userId: this.user.id,
              provider: "claude",
              model: servedModel,
              channel: null,
              inputTokens: u.input_tokens + cacheWrite + cacheRead,
              outputTokens: u.output_tokens,
              costMicros: cost,
              byok,
            });
            await this.update({ costMicros: { increment: cost } });
          },
          approve: (summary, amount) => this.approve(summary, amount),
          ask: (question) => this.ask(question),
          handOff: (reason) => this.handOff(reason),
        },
      });
    } catch (err) {
      const problem = apiKey ? keyProblem(err) : null;
      if (!problem) throw err;
      if (problem === "rejected") await markModelKeyInvalid(this.user.id, "claude");
      await this.end("FAILED", keyProblemMessage("claude", problem), { error: `key_${problem}` });
      return;
    }

    const status: Record<Outcome, ComputerTaskStatus> = { done: "SUCCEEDED", failed: "FAILED", blocked: "FAILED", stopped: "CANCELED" };
    await this.end(status[result.outcome], result.summary, { notify: result.outcome !== "stopped" });
  }

  /**
   * Turns request_approval into an Action, so it's approved exactly like everything else: YES by
   * text (with the PIN for purchases, if they set one) or in the app. The domain comes from the
   * browser, not from the model.
   */
  private async approve(summary: string, amountUsd: number | undefined): Promise<"approved" | "denied" | "stopped"> {
    const host = hostOf(this.browser!.url());
    const risk = amountUsd && amountUsd > 0 ? "HIGH" : "MEDIUM";
    const requiresPin = Boolean(this.user.pinHash) && risk === "HIGH";
    await this.prisma.action.updateMany({
      where: { userId: this.user.id, status: "AWAITING_CONFIRMATION" },
      data: { status: "EXPIRED", error: "Replaced by a newer request" },
    });
    const action = await this.prisma.action.create({
      data: {
        userId: this.user.id,
        type: "computer_confirm",
        status: "AWAITING_CONFIRMATION",
        summary: `On ${host}: ${summary}`.slice(0, 600),
        payload: { taskId: this.task.id },
        risk,
        requiresConfirmation: true,
        requiresPin,
        // Web pages are third-party content.
        tainted: true,
        channel: "SMS",
        conversationId: this.task.conversationId,
        expiresAt: new Date(Date.now() + APPROVAL_EXPIRY_MS),
      },
    });
    await this.update({ status: "WAITING_APPROVAL", actionId: action.id, waitingKind: null, waitingFor: action.summary });
    await addComputerStep(this.task.id, "approval", `Waiting for your OK: ${action.summary}`);
    await this.text(`${confirmationPrompt([{ summary: action.summary, requiresPin }])}\n\nThe screen is in the Relay app.`, "confirm");

    // Set from callbacks, so it lives on an object the compiler doesn't narrow.
    const seen: { decision: "approved" | "denied" | null } = { decision: null };
    const result = await this.wait({
      on: (s) => {
        if (s.type !== "approved" && s.type !== "denied") return null;
        seen.decision = s.type;
        return "done";
      },
      poll: async () => {
        const current = await this.prisma.action.findUnique({ where: { id: action.id }, select: { status: true, expiresAt: true } });
        if (!current) return null;
        if (["CONFIRMED", "RUNNING", "SUCCEEDED"].includes(current.status)) seen.decision = "approved";
        else if (["DENIED", "EXPIRED", "FAILED"].includes(current.status)) seen.decision = "denied";
        else if (current.expiresAt && current.expiresAt < new Date()) seen.decision = "denied";
        return seen.decision ? "done" : null;
      },
    });
    if (result === "stop") return "stopped";
    const final = result === "timeout" ? "denied" : (seen.decision ?? "denied");
    if (final === "denied") {
      await this.prisma.action.updateMany({ where: { id: action.id, status: "AWAITING_CONFIRMATION" }, data: { status: "EXPIRED" } });
    }
    await this.update({ status: "RUNNING", actionId: null, waitingFor: null });
    await addComputerStep(this.task.id, "note", final === "approved" ? "Approved" : "Not approved");
    return final;
  }

  private async ask(question: string): Promise<string | null> {
    await this.update({ status: "WAITING_USER", waitingKind: "answer", waitingFor: question.slice(0, 600) });
    await addComputerStep(this.task.id, "question", question);
    await this.text(question, "question");
    let answer = "";
    const result = await this.wait({
      on: (s) => {
        if (s.type !== "answer") return null;
        answer = s.text;
        return "done";
      },
    });
    if (result === "stop") return null;
    await this.update({ status: "RUNNING", waitingKind: null, waitingFor: null });
    if (result === "timeout") return "(No answer after 30 minutes. Finish and say what you found.)";
    await addComputerStep(this.task.id, "answer", answer);
    return answer;
  }

  private async handOff(reason: string): Promise<"done" | "stopped" | "timeout"> {
    const browser = this.browser!;
    await browser.setViewport(TAKEOVER_VIEWPORT);
    await this.publishScreen();
    await this.update({ status: "WAITING_USER", waitingKind: "takeover", waitingFor: reason.slice(0, 300) });
    await addComputerStep(this.task.id, "handoff", reason);
    await this.text(`${reason.replace(/\.$/, "")}. Open the Relay app to do it in Relay's browser, then tap Done.`, "handoff");
    const result = await this.wait({ takeover: true, on: (s) => (s.type === "resume" ? "done" : null) });
    await browser.setViewport(COMPUTER_VIEWPORT);
    if (result === "stop") return "stopped";
    await this.update({ status: "RUNNING", waitingKind: null, waitingFor: null });
    if (result === "done") await addComputerStep(this.task.id, "note", "You finished. Picking it back up.");
    return result;
  }
}
