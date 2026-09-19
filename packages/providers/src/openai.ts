import OpenAI from "openai";
import { optional, required } from "./env.js";
import { OFFICIAL_BASE_URL, rethrowKeyError } from "./keys.js";
import { mapFinish, runChat, toChatMessages, toChatTools } from "./openai-compat.js";
import { costMicros, parsePrice } from "./pricing.js";
import type { CompletionRequest, CompletionResult, ModelProvider } from "./types.js";

let client: OpenAI | undefined;
function clientFor(apiKey?: string): OpenAI {
  if (apiKey) return new OpenAI({ apiKey, baseURL: OFFICIAL_BASE_URL.gpt });
  client ??= new OpenAI({ apiKey: required("OPENAI_API_KEY") });
  return client;
}

export const openai: ModelProvider = {
  id: "gpt",
  supportsTools: true,

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const fast = req.tier === "fast";
    const model = fast
      ? (optional("OPENAI_FAST_MODEL") ?? required("OPENAI_MODEL"))
      : required("OPENAI_MODEL");
    const price = parsePrice(fast ? optional("OPENAI_FAST_PRICE") : optional("OPENAI_PRICE"));
    const tools = toChatTools(req.tools);

    let out;
    try {
      out = await runChat(
        clientFor(req.apiKey),
        {
          model,
          messages: toChatMessages(req),
          max_completion_tokens: req.maxTokens ?? 16000,
          ...(tools ? { tools } : {}),
        },
        req,
      );
    } catch (err) {
      rethrowKeyError("gpt", req.apiKey, err);
    }

    const stopReason = mapFinish(out.finish);
    return {
      text: stopReason === "refusal" ? "" : out.text,
      toolCalls: stopReason === "tool_use" ? out.toolCalls : [],
      stopReason,
      model: out.model,
      usage: {
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        costMicros: costMicros(price, out.inputTokens, out.outputTokens),
      },
    };
  },
};
