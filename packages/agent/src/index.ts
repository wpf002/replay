import { ROUTE_PREFIXES, type ModelId } from "@relay/types";

/** Strip a leading @model prefix and return which model it selects. */
export function parseRoute(text: string, fallback: ModelId): { model: ModelId; text: string } {
  const match = /^\s*(@\w+)\b[\s,:]*/i.exec(text);
  const prefix = match?.[1]?.toLowerCase();
  const model = prefix ? ROUTE_PREFIXES[prefix] : undefined;
  if (!match || !model) return { model: fallback, text: text.trim() };
  return { model, text: text.slice(match[0].length).trim() };
}

// TODO: agent loop, tool registry (gmail, calendar, reminders, web_search, memory),
// confirmation gate for any tool that sends, spends, or contacts a third party.
