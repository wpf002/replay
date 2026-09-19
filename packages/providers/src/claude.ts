import Anthropic from "@anthropic-ai/sdk";
import { optional, required } from "./env.js";
import { costMicros, parsePrice } from "./pricing.js";
import type {
  AgentMessage,
  CompletionRequest,
  CompletionResult,
  ModelProvider,
  StopReason,
} from "./types.js";

type Params = Anthropic.Beta.MessageCreateParamsNonStreaming;
type MessageParam = Anthropic.Beta.BetaMessageParam;

// Opus 5 / Fable 5.x can decline a request via safety classifiers; "default" re-runs it on
// Anthropic's recommended fallback server-side instead of returning the refusal.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const supportsFallbacks = (model: string) => /^claude-(opus-5|fable-5)/.test(model);
// Haiku 4.5 rejects output_config.effort.
const supportsEffort = (model: string) => !model.includes("haiku");

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic({ apiKey: required("ANTHROPIC_API_KEY") });
  return client;
}

function toClaudeMessages(messages: AgentMessage[]): MessageParam[] {
  const out: MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (m.content.trim()) out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      if (Array.isArray(m.raw)) {
        out.push({ role: "assistant", content: m.raw as Anthropic.Beta.BetaContentBlockParam[] });
        continue;
      }
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (m.content.trim()) content.push({ type: "text", text: m.content });
      for (const call of m.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.input ?? {} });
      }
      if (content.length) out.push({ role: "assistant", content });
    } else {
      // All results for one assistant turn go back in a single user message.
      out.push({
        role: "user",
        content: m.results.map((r) => ({
          type: "tool_result" as const,
          tool_use_id: r.toolCallId,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      });
    }
  }
  return out;
}

function mapStop(reason: string | null): StopReason {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "end";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "refusal":
      return "refusal";
    default:
      return "other";
  }
}

export const claude: ModelProvider = {
  id: "claude",
  supportsTools: true,

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const fast = req.tier === "fast";
    const model = fast
      ? (optional("CLAUDE_FAST_MODEL") ?? required("CLAUDE_MODEL"))
      : required("CLAUDE_MODEL");
    const price = parsePrice(fast ? optional("CLAUDE_FAST_PRICE") : optional("CLAUDE_PRICE"));

    const params: Params = {
      model,
      max_tokens: req.maxTokens ?? 16000,
      system: [
        { type: "text", text: req.system.stable, cache_control: { type: "ephemeral" } },
        ...(req.system.dynamic ? [{ type: "text" as const, text: req.system.dynamic }] : []),
      ],
      messages: toClaudeMessages(req.messages),
      ...(req.tools?.length
        ? {
            tools: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
            })),
          }
        : {}),
      // Replies go out as SMS or speech; lower effort keeps them quick and cheap.
      ...(supportsEffort(model) ? { output_config: { effort: fast ? "low" : "medium" } } : {}),
      ...(supportsFallbacks(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
    };

    const options = req.signal ? { signal: req.signal } : {};
    let message: Anthropic.Beta.BetaMessage;
    if (req.onText) {
      const stream = getClient().beta.messages.stream(params, options);
      const onText = req.onText;
      stream.on("text", (delta) => onText(delta));
      message = await stream.finalMessage();
    } else {
      message = await getClient().beta.messages.create(params, options);
    }

    const stopReason = mapStop(message.stop_reason);
    const u = message.usage;
    const cacheWrite = u.cache_creation_input_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    // Cache writes bill at 1.25x input, cache reads at 0.1x.
    const billedInput = Math.ceil(u.input_tokens + cacheWrite * 1.25 + cacheRead * 0.1);
    const usage = {
      inputTokens: u.input_tokens + cacheWrite + cacheRead,
      outputTokens: u.output_tokens,
      costMicros: costMicros(price, billedInput, u.output_tokens),
    };

    // A refusal can cut output off mid-block, and a max_tokens stop can truncate a tool input.
    // Never run tools from either.
    if (stopReason === "refusal") {
      return { text: "", toolCalls: [], stopReason, usage, model: message.model };
    }

    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    const toolCalls =
      stopReason === "max_tokens"
        ? []
        : message.content
            .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
            .map((b) => ({ id: b.id, name: b.name, input: b.input }));

    return { text, toolCalls, stopReason, usage, model: message.model, raw: message.content };
  },
};
