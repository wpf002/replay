import { AI_PROVIDERS, type MeDTO, type ModelId } from "@relay/types";
import type { IconName } from "../ui/icon";

export const MODEL_INFO: Record<ModelId, { name: string; by: string; prefix: string; blurb: string; icon: IconName }> = {
  claude: {
    name: AI_PROVIDERS.claude.name,
    by: AI_PROVIDERS.claude.company,
    prefix: AI_PROVIDERS.claude.prefix,
    blurb: "Writing, reasoning, and anything that takes actions.",
    icon: "feather",
  },
  gpt: {
    name: AI_PROVIDERS.gpt.name,
    by: AI_PROVIDERS.gpt.company,
    prefix: AI_PROVIDERS.gpt.prefix,
    blurb: "OpenAI's models, with the same email, calendar, and reminder tools.",
    icon: "message-circle",
  },
  perplexity: {
    name: AI_PROVIDERS.perplexity.name,
    by: AI_PROVIDERS.perplexity.company,
    prefix: AI_PROVIDERS.perplexity.prefix,
    blurb: "Live web answers with sources. Can't take actions.",
    icon: "globe",
  },
};

/**
 * connected: their own key works. invalid: the provider stopped accepting it.
 * included: Relay's key covers it (up to the daily limit). none: they need to connect it.
 */
export type ModelAccess = "connected" | "invalid" | "included" | "none";

export function modelAccess(me: MeDTO, model: ModelId): ModelAccess {
  const account = me.aiAccounts.find((a) => a.provider === model);
  if (account?.connected) return account.invalid ? "invalid" : "connected";
  return me.includedModels.includes(model) ? "included" : "none";
}

/** Relay can answer with this model right now. */
export function canUse(me: MeDTO, model: ModelId): boolean {
  const access = modelAccess(me, model);
  return access === "connected" || access === "included" || (access === "invalid" && me.includedModels.includes(model));
}

export const ACCESS_LABEL: Record<ModelAccess, string> = {
  connected: "Connected",
  invalid: "Key stopped working",
  included: "Included",
  none: "Not connected",
};

/** "Claude · Anthropic", or just "Perplexity" when the product and company share a name. */
export const modelTitle = (model: ModelId) =>
  MODEL_INFO[model].name === MODEL_INFO[model].by ? MODEL_INFO[model].name : `${MODEL_INFO[model].name} · ${MODEL_INFO[model].by}`;
