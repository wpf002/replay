import Anthropic from "@anthropic-ai/sdk";
import { OFFICIAL_BASE_URL } from "@relay/providers";
import type { ModelId } from "@relay/types";
import OpenAI from "openai";

export type Probe = { ok: true } | { ok: false; message: string };

function describe(err: unknown): string {
  const e = err as { status?: number; message?: string; error?: { message?: string } };
  const detail = e.error?.message ?? e.message ?? "unknown error";
  return e.status ? `${e.status}: ${detail}` : detail;
}

/**
 * Sends one tiny request ("Reply with OK", a few output tokens) to confirm the model ID exists,
 * works with the API Relay calls, and the account has credit. Costs a fraction of a cent.
 */
export async function probeModel(provider: ModelId, apiKey: string, model: string): Promise<Probe> {
  const prompt = "Reply with OK.";
  try {
    if (provider === "claude") {
      const client = new Anthropic({ apiKey, baseURL: OFFICIAL_BASE_URL.claude, maxRetries: 0, timeout: 30_000 });
      await client.messages.create({
        model,
        max_tokens: 16,
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      });
      return { ok: true };
    }
    const client = new OpenAI({ apiKey, baseURL: OFFICIAL_BASE_URL[provider], maxRetries: 0, timeout: 30_000 });
    if (provider === "gpt") {
      await client.chat.completions.create({ model, messages: [{ role: "user", content: prompt }], max_completion_tokens: 16 });
    } else {
      await client.chat.completions.create({ model, messages: [{ role: "user", content: prompt }], max_tokens: 16 });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, message: describe(err) };
  }
}
