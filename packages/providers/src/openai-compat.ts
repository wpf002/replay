import OpenAI from "openai";
import type {
  AgentMessage,
  CompletionRequest,
  StopReason,
  ToolCall,
  ToolSpec,
} from "./types.js";

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

/** Shared by OpenAI and Perplexity, which speaks the same Chat Completions wire format. */
export function toChatMessages(req: CompletionRequest, opts: { alternate?: boolean } = {}): ChatMessage[] {
  const system = [req.system.stable, req.system.dynamic].filter(Boolean).join("\n\n");
  const out: ChatMessage[] = [{ role: "system", content: system }];

  for (const m of req.messages as AgentMessage[]) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      const calls = m.toolCalls ?? [];
      out.push({
        role: "assistant",
        content: m.content || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: "function" as const,
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
              })),
            }
          : {}),
      });
    } else {
      for (const r of m.results) {
        out.push({ role: "tool", tool_call_id: r.toolCallId, content: r.content });
      }
    }
  }

  if (!opts.alternate) return out;

  // Perplexity requires strict user/assistant alternation after the system message.
  const merged: ChatMessage[] = [out[0]!];
  for (const m of out.slice(1)) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = typeof m.content === "string" ? m.content : "";
    if (!text) continue;
    const prev = merged[merged.length - 1]!;
    if (prev.role === m.role) {
      prev.content = `${prev.content as string}\n\n${text}`;
    } else if (merged.length === 1 && m.role === "assistant") {
      continue; // first turn after system must be the user's
    } else {
      merged.push({ role: m.role, content: text } as ChatMessage);
    }
  }
  return merged;
}

export function toChatTools(tools: ToolSpec[] | undefined): OpenAI.Chat.ChatCompletionTool[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
}

export function mapFinish(reason: string | null | undefined): StopReason {
  switch (reason) {
    case "stop":
      return "end";
    case "tool_calls":
    case "function_call":
      return "tool_use";
    case "length":
      return "max_tokens";
    case "content_filter":
      return "refusal";
    default:
      return "other";
  }
}

function parseArgs(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    // Handed to the tool's schema check, which reports it back to the model as an error.
    return { __invalid_json: raw };
  }
}

export interface ChatOutcome {
  text: string;
  toolCalls: ToolCall[];
  finish: string | null | undefined;
  model: string;
  inputTokens: number;
  outputTokens: number;
  extra: Record<string, unknown>;
}

/** Runs one Chat Completions request, streaming when req.onText is set. */
export async function runChat(
  client: OpenAI,
  body: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  req: CompletionRequest,
): Promise<ChatOutcome> {
  const options = req.signal ? { signal: req.signal } : {};

  if (!req.onText) {
    const res = await client.chat.completions.create(body, options);
    const choice = res.choices[0];
    const toolCalls: ToolCall[] = (choice?.message.tool_calls ?? [])
      .filter((c): c is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => c.type === "function")
      .map((c) => ({ id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) }));
    return {
      text: choice?.message.content?.trim() ?? "",
      toolCalls,
      finish: choice?.finish_reason,
      model: res.model,
      inputTokens: res.usage?.prompt_tokens ?? 0,
      outputTokens: res.usage?.completion_tokens ?? 0,
      extra: res as unknown as Record<string, unknown>,
    };
  }

  const stream = await client.chat.completions.create(
    { ...body, stream: true, stream_options: { include_usage: true } },
    options,
  );
  let text = "";
  let finish: string | null | undefined;
  let model = body.model;
  let inputTokens = 0;
  let outputTokens = 0;
  let extra: Record<string, unknown> = {};
  const calls = new Map<number, { id: string; name: string; args: string }>();

  for await (const chunk of stream) {
    model = chunk.model || model;
    extra = { ...extra, ...(chunk as unknown as Record<string, unknown>) };
    if (chunk.usage) {
      inputTokens = chunk.usage.prompt_tokens;
      outputTokens = chunk.usage.completion_tokens;
    }
    const choice = chunk.choices[0];
    if (!choice) continue;
    if (choice.delta.content) {
      text += choice.delta.content;
      req.onText(choice.delta.content);
    }
    for (const tc of choice.delta.tool_calls ?? []) {
      const entry = calls.get(tc.index) ?? { id: "", name: "", args: "" };
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name += tc.function.name;
      if (tc.function?.arguments) entry.args += tc.function.arguments;
      calls.set(tc.index, entry);
    }
    if (choice.finish_reason) finish = choice.finish_reason;
  }

  const toolCalls = [...calls.values()]
    .filter((c) => c.name)
    .map((c) => ({ id: c.id, name: c.name, input: parseArgs(c.args) }));
  return { text: text.trim(), toolCalls, finish, model, inputTokens, outputTokens, extra };
}
