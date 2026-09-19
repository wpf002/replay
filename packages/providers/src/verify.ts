import { AI_PROVIDERS, ProviderKeyError, type ModelId } from "@relay/types";
import { claude } from "./claude.js";
import { checkKey } from "./keys.js";
import { openai } from "./openai.js";
import { perplexity } from "./perplexity.js";
import type { ModelProvider } from "./types.js";

const PROVIDERS: Record<ModelId, ModelProvider> = { claude, gpt: openai, perplexity };

export type KeyVerdict =
  | { ok: true }
  | {
      ok: false;
      problem: "invalid" | "forbidden" | "unreachable" | "no_credit" | "model";
      message: string;
    };

function providerMessage(err: unknown): string {
  const e = err as { error?: { error?: { message?: unknown }; message?: unknown }; message?: unknown };
  const text = e.error?.error?.message ?? e.error?.message ?? e.message;
  return typeof text === "string" ? text.replace(/\s+/g, " ").slice(0, 200) : "";
}

/**
 * Checks a key the way Relay will use it: first a free check that the provider accepts it,
 * then one tiny request (a few tokens) on the model Relay runs for that person. The second
 * step catches what listing models can't: an account with no credit, or a model it can't use.
 */
export async function verifyKey(provider: ModelId, key: string): Promise<KeyVerdict> {
  const apiKey = key.trim();
  const { company } = AI_PROVIDERS[provider];
  const check = await checkKey(provider, apiKey);
  if (!check.ok) return { ok: false, problem: check.reason, message: check.message };

  try {
    await PROVIDERS[provider].complete({
      apiKey,
      tier: "fast",
      system: { stable: "Reply with OK." },
      messages: [{ role: "user", content: "OK?" }],
      maxTokens: 16,
    });
    return { ok: true };
  } catch (err) {
    if (err instanceof ProviderKeyError) {
      return err.problem === "no_credit"
        ? { ok: false, problem: "no_credit", message: `That key works, but the ${company} account has no credit. Add some, then connect again.` }
        : { ok: false, problem: "invalid", message: "That key was rejected. Check that you copied all of it." };
    }
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 403 || status === 404) {
      const detail = providerMessage(err);
      return {
        ok: false,
        problem: "model",
        message: `That key works, but ${company} refused the request${detail ? `: ${detail}` : "."}`,
      };
    }
    return { ok: false, problem: "unreachable", message: `Couldn't reach ${company}. Try again in a minute.` };
  }
}
