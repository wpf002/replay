import type { ModelId } from "@relay/types";
import { claude } from "./claude.js";
import { openai } from "./openai.js";
import { perplexity } from "./perplexity.js";
import type { ModelProvider } from "./types.js";

export * from "./pricing.js";
export * from "./types.js";
export { claude, openai, perplexity };

const PROVIDERS: Record<ModelId, ModelProvider> = { claude, gpt: openai, perplexity };

export function getProvider(id: ModelId): ModelProvider {
  return PROVIDERS[id];
}
