import type Anthropic from "@anthropic-ai/sdk";
import { BrowserActionError, type RelayBrowser } from "./browser.js";

export type Outcome = "done" | "failed" | "blocked" | "stopped";

export interface LoopHooks {
  /** Adds a line to the task's activity log. */
  step: (kind: string, text: string) => Promise<void>;
  /** Publishes the current screen to the live view. */
  screen: () => Promise<void>;
  /** Asks the person to approve; resolves once they decide. */
  approve: (summary: string, amountUsd: number | undefined) => Promise<"approved" | "denied" | "stopped">;
  /** Texts the person a question; resolves with their answer, or null if the task stopped. */
  ask: (question: string) => Promise<string | null>;
  /** Hands the browser to the person and waits until they tap Done. */
  handOff: (reason: string) => Promise<"done" | "stopped" | "timeout">;
  stopped: () => Promise<boolean>;
  usage: (usage: Anthropic.Usage, model: string) => Promise<void>;
}

export interface LoopOptions {
  client: Anthropic;
  model: string;
  system: string;
  context: string;
  goal: string;
  startUrl?: string | null;
  browser: RelayBrowser;
  hooks: LoopHooks;
  maxRequests?: number;
  maxActiveMs?: number;
}

export interface LoopResult {
  outcome: Outcome;
  summary: string;
}

const HALT = "Not executed: an earlier action in this turn failed.";

export const CUSTOM_TOOLS: Anthropic.Tool[] = [
  {
    name: "request_approval",
    description:
      "Ask the person to approve before the final click on anything that spends money, books, reserves, sends, posts, submits personal details, accepts terms, or changes an account. Waits for their answer. Take a screenshot first so the live view shows what they're approving.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "Exactly what will happen, from what's on screen: what's being bought or booked, date and time, total with taxes and fees, and the payment method as shown. One or two sentences.",
        },
        amount_usd: { type: "number", description: "The total charge in US dollars, if money is involved." },
      },
      required: ["summary"],
    },
  },
  {
    name: "ask_user",
    description: "Text the person one short question and wait for the answer, e.g. which of two flights, or whether a substitution is OK.",
    input_schema: {
      type: "object",
      properties: { question: { type: "string", description: "The question, with the options and prices if there are any." } },
      required: ["question"],
    },
  },
  {
    name: "hand_off",
    description:
      "Give the person control of the browser for something only they can do: signing in, one-time codes, CAPTCHAs, adding a card or address. Waits until they tap Done in the Relay app.",
    input_schema: {
      type: "object",
      properties: { reason: { type: "string", description: 'What they need to do, like "Sign in to your Instacart account".' } },
      required: ["reason"],
    },
  },
  {
    name: "finish",
    description: "End the task. The summary is texted to the person.",
    input_schema: {
      type: "object",
      properties: {
        outcome: { type: "string", enum: ["done", "failed", "blocked"] },
        summary: { type: "string", description: "1 to 3 short sentences: the result, confirmation numbers, times, totals." },
      },
      required: ["outcome", "summary"],
    },
  },
];

export const BROWSER_TOOLSET: Anthropic.BrowserToolset20260801 = {
  type: "browser_toolset_20260801",
  configs: {
    zoom: { enabled: false },
    hold_key: { enabled: false },
    left_mouse_down: { enabled: false },
    left_mouse_up: { enabled: false },
  },
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** The activity-log line for a browser action, or null for ones too small to mention. */
export function describeAction(name: string, input: Record<string, unknown>): string | null {
  if (name === "navigate") {
    const url = String(input.url ?? "");
    return ["back", "forward", "reload"].includes(url) ? null : `Opened ${hostOf(url)}`;
  }
  if (name === "type") {
    const text = String(input.text ?? "");
    return `Typed "${text.length > 40 ? `${text.slice(0, 40)}…` : text}"`;
  }
  if (name === "form_input") return "Filled in a field";
  return null;
}

/** Keeps the request small: once more than 10 screenshots pile up, all but the last 3 become text. */
export function pruneScreenshots(messages: Anthropic.MessageParam[]): void {
  const holders: Anthropic.ToolResultBlockParam[] = [];
  for (const m of messages) {
    if (m.role !== "user" || typeof m.content === "string") continue;
    for (const block of m.content) {
      if (block.type === "tool_result" && Array.isArray(block.content) && block.content.some((c) => c.type === "image")) {
        holders.push(block);
      }
    }
  }
  if (holders.length <= 10) return;
  for (const block of holders.slice(0, -3)) {
    block.content = (block.content as Exclude<Anthropic.ToolResultBlockParam["content"], string | undefined>).map((c) =>
      c.type === "image" ? { type: "text" as const, text: "(Earlier screenshot removed.)" } : c,
    );
  }
}

/** Moves the cache breakpoint to the end of the newest message so each request reuses the last. */
export function markCache(messages: Anthropic.MessageParam[]): void {
  for (const m of messages) {
    if (typeof m.content === "string") continue;
    for (const block of m.content) if ("cache_control" in block) delete (block as { cache_control?: unknown }).cache_control;
  }
  const last = messages.at(-1);
  if (last && typeof last.content !== "string") {
    const block = last.content.at(-1) as { cache_control?: Anthropic.CacheControlEphemeral } | undefined;
    if (block) block.cache_control = { type: "ephemeral" };
  }
}

/**
 * The browser agent: Claude with the browser toolset plus four tools of Relay's own. Browser
 * actions run in order and stop at the first failure. Anything irreversible goes through
 * request_approval; sign-ins and codes go to the person through hand_off.
 */
export async function runComputerLoop(o: LoopOptions): Promise<LoopResult> {
  const maxRequests = o.maxRequests ?? 80;
  const maxActiveMs = o.maxActiveMs ?? 25 * 60_000;
  let activeMs = 0;
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Task: ${o.goal}${o.startUrl ? `\n\nStart at ${o.startUrl}.` : ""}`,
    },
  ];

  for (let request = 1; request <= maxRequests; request++) {
    if (await o.hooks.stopped()) return { outcome: "stopped", summary: "Stopped." };
    if (activeMs > maxActiveMs) {
      return { outcome: "blocked", summary: "This was taking too long, so I stopped. Want me to try a different way?" };
    }
    const started = Date.now();

    pruneScreenshots(messages);
    markCache(messages);
    const response = await o.client.messages.create({
      model: o.model,
      max_tokens: 16_000,
      thinking: { type: "adaptive", display: "omitted" },
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: o.system, cache_control: { type: "ephemeral" } },
        { type: "text", text: o.context },
      ],
      tools: [BROWSER_TOOLSET, ...CUSTOM_TOOLS],
      messages,
    });
    await o.hooks.usage(response.usage, response.model);
    messages.push({ role: "assistant", content: response.content as Anthropic.ContentBlockParam[] });

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) await o.hooks.step("note", block.text.trim());
    }

    if (response.stop_reason === "refusal") return { outcome: "failed", summary: "I can't help with that one." };
    if (response.stop_reason === "max_tokens" || response.stop_reason === "model_context_window_exceeded") {
      return { outcome: "failed", summary: "That got too long for me to finish. Try breaking it into smaller steps." };
    }

    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!calls.length) {
      const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(" ").trim();
      return { outcome: "done", summary: text || "Done." };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    let failed = false;
    let finish: LoopResult | null = null;
    let touchedPage = false;
    let waited = 0;

    for (const call of calls) {
      const input = (call.input ?? {}) as Record<string, unknown>;
      const base = { type: "tool_result" as const, tool_use_id: call.id };

      if (call.toolset_name === "browser") {
        const result = { ...base, toolset_name: "browser" };
        if (failed || finish) {
          results.push({ ...result, is_error: true, content: HALT });
          continue;
        }
        try {
          const content = await o.browser.run(call.name, input);
          results.push({ ...result, content });
          touchedPage = true;
          const line = describeAction(call.name, input);
          if (line) await o.hooks.step("action", line);
        } catch (err) {
          failed = true;
          const message = err instanceof BrowserActionError ? err.message : `The action failed: ${(err as Error).message.split("\n")[0]}`;
          results.push({ ...result, is_error: true, content: `Error: ${message}` });
        }
        continue;
      }

      if (finish) {
        results.push({ ...base, is_error: true, content: "The task already finished." });
        continue;
      }
      // Waiting on the person isn't time spent working.
      const waitStart = Date.now();
      switch (call.name) {
        case "request_approval": {
          await o.hooks.screen();
          const summary = String(input.summary ?? "").trim();
          const amount = typeof input.amount_usd === "number" ? input.amount_usd : undefined;
          const decision = summary ? await o.hooks.approve(summary, amount) : "denied";
          if (decision === "stopped") return { outcome: "stopped", summary: "Stopped." };
          results.push({
            ...base,
            content:
              decision === "approved"
                ? "Approved. Go ahead with exactly what you described, then confirm it went through."
                : "They said no. Don't do it. Ask what they'd like instead with ask_user, or finish.",
          });
          break;
        }
        case "ask_user": {
          const answer = await o.hooks.ask(String(input.question ?? "").trim());
          if (answer === null) return { outcome: "stopped", summary: "Stopped." };
          results.push({ ...base, content: `Their answer: ${answer}` });
          break;
        }
        case "hand_off": {
          const handed = await o.hooks.handOff(String(input.reason ?? "").trim() || "Take over the browser");
          if (handed === "stopped") return { outcome: "stopped", summary: "Stopped." };
          results.push({
            ...base,
            content:
              handed === "done"
                ? "They're done. Take a screenshot to see where things stand, then continue."
                : "They didn't respond for 30 minutes. Finish with outcome blocked and say what they need to do.",
          });
          touchedPage = true;
          break;
        }
        case "finish": {
          const outcome = ["done", "failed", "blocked"].includes(String(input.outcome)) ? (input.outcome as Outcome) : "done";
          finish = { outcome, summary: String(input.summary ?? "").trim() || "Done." };
          results.push({ ...base, content: "Finished." });
          break;
        }
        default:
          results.push({ ...base, is_error: true, content: `There is no tool named ${call.name}.` });
      }
      waited += Date.now() - waitStart;
    }

    if (touchedPage) await o.hooks.screen();
    if (finish) return finish;
    messages.push({ role: "user", content: results });
    activeMs += Date.now() - started - waited;
  }
  return { outcome: "blocked", summary: "That took more steps than I allow for one task, so I stopped. Want me to keep going?" };
}
