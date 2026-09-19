export const MODELS = ["claude", "gpt", "perplexity"] as const;
export type ModelId = (typeof MODELS)[number];

export type Channel = "sms" | "voice";

/** One inbound turn from any channel, normalized. */
export interface InboundTurn {
  userId: string;
  channel: Channel;
  from: string; // E.164
  text: string;
  providerMessageId?: string;
}

/** Explicit routing prefixes a user can type or say. */
export const ROUTE_PREFIXES: Record<string, ModelId> = {
  "@claude": "claude",
  "@gpt": "gpt",
  "@chatgpt": "gpt",
  "@web": "perplexity",
  "@perplexity": "perplexity",
};
