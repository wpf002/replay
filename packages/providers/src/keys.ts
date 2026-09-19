import Anthropic from "@anthropic-ai/sdk";
import { detectKeyProvider, ProviderKeyError, type KeyProblem, type ModelId } from "@relay/types";
import OpenAI from "openai";

// Keys a person connects are only ever sent to the provider's own API, even if the operator
// points the platform clients somewhere else with ANTHROPIC_BASE_URL / OPENAI_BASE_URL.
export const OFFICIAL_BASE_URL: Record<ModelId, string> = {
  claude: "https://api.anthropic.com",
  gpt: "https://api.openai.com/v1",
  perplexity: "https://api.perplexity.ai",
};

export type KeyCheck =
  | { ok: true; models?: string[] }
  | { ok: false; reason: "invalid" | "forbidden" | "unreachable"; message: string };

export const detectProvider = detectKeyProvider;

// Anthropic: 400 "Your credit balance is too low". OpenAI: 429 insufficient_quota.
const NO_CREDIT = /credit balance|insufficient_quota|insufficient (credit|funds|balance)|exceeded your current quota/i;

/**
 * What an error from a request made with a person's own key says about the key: the provider
 * refused it, the account has no credit, or neither (null: a normal failure).
 */
export function keyProblem(err: unknown): KeyProblem | null {
  const e = err as { status?: number; code?: unknown; message?: unknown } | null;
  if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError || e?.status === 401) {
    return "rejected";
  }
  if (e?.status === 402 || NO_CREDIT.test(`${String(e?.code ?? "")} ${String(e?.message ?? "")}`)) return "no_credit";
  return null;
}

/** Rethrows a failed request as ProviderKeyError when it was the person's key or account. */
export function rethrowKeyError(provider: ModelId, apiKey: string | undefined, err: unknown): never {
  const problem = apiKey ? keyProblem(err) : null;
  if (problem) throw new ProviderKeyError(provider, problem);
  throw err;
}

/** "…a1b2" for display. Never store or show more than this. */
export function keyHint(key: string): string {
  return `…${key.trim().slice(-4)}`;
}

function failure(err: unknown): KeyCheck {
  const status = (err as { status?: number })?.status;
  if (err instanceof Anthropic.AuthenticationError || err instanceof OpenAI.AuthenticationError || status === 401) {
    return { ok: false, reason: "invalid", message: "That key was rejected. Check that you copied all of it." };
  }
  if (err instanceof Anthropic.PermissionDeniedError || err instanceof OpenAI.PermissionDeniedError || status === 403) {
    return { ok: false, reason: "forbidden", message: "That key doesn't have access to the API. Check its permissions." };
  }
  if (status === 429) return { ok: true };
  return { ok: false, reason: "unreachable", message: "Couldn't reach the provider to check the key. Try again." };
}

/**
 * Confirms a key works without spending anything: Anthropic and OpenAI list models, and
 * Perplexity rejects a bad key before it looks at the (deliberately empty) request.
 */
export async function checkKey(provider: ModelId, key: string): Promise<KeyCheck> {
  const apiKey = key.trim();
  try {
    if (provider === "claude") {
      const client = new Anthropic({ apiKey, baseURL: OFFICIAL_BASE_URL.claude, maxRetries: 0, timeout: 10_000 });
      const page = await client.models.list({ limit: 100 });
      return { ok: true, models: page.data.map((m) => m.id) };
    }
    if (provider === "gpt") {
      const client = new OpenAI({ apiKey, baseURL: OFFICIAL_BASE_URL.gpt, maxRetries: 0, timeout: 10_000 });
      const page = await client.models.list();
      return { ok: true, models: page.data.map((m) => m.id) };
    }
    const client = new OpenAI({ apiKey, baseURL: OFFICIAL_BASE_URL.perplexity, maxRetries: 0, timeout: 10_000 });
    try {
      await client.chat.completions.create({ model: "sonar", messages: [], max_tokens: 1 });
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 400 || status === 422) return { ok: true };
      throw err;
    }
    return { ok: true };
  } catch (err) {
    return failure(err);
  }
}
