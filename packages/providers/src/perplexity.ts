import OpenAI from "openai";
import { optional, required } from "./env.js";
import { OFFICIAL_BASE_URL, rethrowKeyError } from "./keys.js";
import { mapFinish, runChat, toChatMessages } from "./openai-compat.js";
import { costMicros, parsePrice } from "./pricing.js";
import type { Citation, CompletionRequest, CompletionResult, ModelProvider } from "./types.js";

let client: OpenAI | undefined;
function clientFor(apiKey?: string): OpenAI {
  if (apiKey) return new OpenAI({ apiKey, baseURL: OFFICIAL_BASE_URL.perplexity });
  client ??= new OpenAI({ apiKey: required("PERPLEXITY_API_KEY"), baseURL: OFFICIAL_BASE_URL.perplexity });
  return client;
}

/** Perplexity returns sources beside the completion: `search_results` (newer) or `citations`. */
function readCitations(extra: Record<string, unknown>): Citation[] {
  const results = extra.search_results;
  if (Array.isArray(results)) {
    return results
      .filter((r): r is { url: string; title?: string } => typeof r?.url === "string")
      .map((r) => ({ url: r.url, ...(r.title ? { title: r.title } : {}) }));
  }
  const urls = extra.citations;
  if (Array.isArray(urls)) {
    return urls.filter((u): u is string => typeof u === "string").map((url) => ({ url }));
  }
  return [];
}

/** Perplexity Sonar: live web answers with sources. It doesn't call tools. */
export const perplexity: ModelProvider = {
  id: "perplexity",
  supportsTools: false,

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const model = required("PERPLEXITY_MODEL");
    const price = parsePrice(optional("PERPLEXITY_PRICE"));

    let out;
    try {
      out = await runChat(
        clientFor(req.apiKey),
        {
          model,
          messages: toChatMessages(req, { alternate: true }),
          max_tokens: req.maxTokens ?? 4000,
        },
        req,
      );
    } catch (err) {
      rethrowKeyError("perplexity", req.apiKey, err);
    }

    const stopReason = mapFinish(out.finish);
    // Sonar puts [1]-style markers in the text; SMS readers can't follow them.
    const text = out.text.replace(/\[\d+\]/g, "").replace(/ +([.,;:!?])/g, "$1").trim();
    return {
      text: stopReason === "refusal" ? "" : text,
      toolCalls: [],
      stopReason: stopReason === "tool_use" ? "end" : stopReason,
      model: out.model,
      citations: readCitations(out.extra),
      usage: {
        inputTokens: out.inputTokens,
        outputTokens: out.outputTokens,
        costMicros: costMicros(price, out.inputTokens, out.outputTokens),
      },
    };
  },
};
