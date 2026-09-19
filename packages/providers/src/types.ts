import type { ModelId } from "@relay/types";

/** A tool the model may call. `inputSchema` is JSON Schema for an object. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  isError?: boolean;
}

/**
 * Provider-neutral conversation turn. `raw` carries the provider's native assistant content
 * (e.g. Claude thinking blocks) so a tool loop can replay it unchanged on the next request.
 */
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[]; raw?: unknown }
  | { role: "tool"; results: ToolResult[] };

export interface SystemPrompt {
  /** Identical across requests so it can be prompt-cached. */
  stable: string;
  /** Per-request context: time, memories, pending actions. */
  dynamic?: string;
}

/** "fast" selects the low-latency model (phone calls). */
export type ModelTier = "default" | "fast";

export interface CompletionRequest {
  system: SystemPrompt;
  messages: AgentMessage[];
  tools?: ToolSpec[];
  tier?: ModelTier;
  maxTokens?: number;
  /** Provided => the response streams and each text delta is passed here. */
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface Citation {
  url: string;
  title?: string;
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  /** Already priced at the provider's rates for the tier that served the request. */
  costMicros: number;
}

export type StopReason = "end" | "tool_use" | "max_tokens" | "refusal" | "other";

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
  stopReason: StopReason;
  usage: Usage;
  /** Provider model ID that actually served the request. */
  model: string;
  citations?: Citation[];
  raw?: unknown;
}

/** Every model sits behind this. Adding a provider = one new file implementing it. */
export interface ModelProvider {
  id: ModelId;
  /** False when the provider can't call tools; the agent then answers without them. */
  supportsTools: boolean;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
