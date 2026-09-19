import { ROUTE_PREFIXES, type ModelId } from "@relay/types";

export interface Route {
  model: ModelId;
  text: string;
  /** True when the user picked the model explicitly. */
  explicit: boolean;
}

/** Strip a leading @model prefix and return which model it selects. */
export function parseRoute(text: string, fallback: ModelId): Route {
  const match = /^\s*(@\w+)\b[\s,:]*/i.exec(text);
  const prefix = match?.[1]?.toLowerCase();
  const model = prefix ? ROUTE_PREFIXES[prefix] : undefined;
  if (!match || !model) return { model: fallback, text: text.trim(), explicit: false };
  return { model, text: text.slice(match[0].length).trim(), explicit: true };
}

// Nobody says "at gpt" on a call. These cover how people actually ask for a model out loud.
const SPOKEN: [RegExp, ModelId][] = [
  [/^\s*(?:(?:hey|ok|okay)[\s,]+)?(?:(?:ask|use)\s+)?(?:chat\s?gpt|gpt)\b[\s,:]*/i, "gpt"],
  [/^\s*(?:(?:hey|ok|okay)[\s,]+)?(?:(?:ask|use)\s+)?claude\b[\s,:]*/i, "claude"],
  [/^\s*(?:(?:ask|use)\s+)?perplexity\b[\s,:]*/i, "perplexity"],
  [/^\s*(?:search the web|web search)(?:\s+for)?\b[\s,:]*/i, "perplexity"],
];

export function parseSpokenRoute(text: string, fallback: ModelId): Route {
  for (const [pattern, model] of SPOKEN) {
    const match = pattern.exec(text);
    if (match) {
      const rest = text.slice(match[0].length).trim();
      if (rest) return { model, text: rest, explicit: true };
    }
  }
  return { model: fallback, text: text.trim(), explicit: false };
}
