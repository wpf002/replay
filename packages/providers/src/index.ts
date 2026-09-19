import type { ModelId } from "@relay/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Every model sits behind this. Adding a provider = one new file implementing it. */
export interface ModelProvider {
  id: ModelId;
  complete(system: string, messages: ChatMessage[]): Promise<string>;
}

// TODO: claude.ts (@anthropic-ai/sdk), openai.ts (openai), perplexity.ts
// (OpenAI-compatible client pointed at https://api.perplexity.ai).
