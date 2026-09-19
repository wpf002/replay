import { getPrisma } from "@relay/db";
import { AI_PROVIDERS, MODELS, type AiAccountDTO, type KeyProblem, type ModelId } from "@relay/types";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { env } from "./env.js";
import { fromDbModel, toDbModel } from "./models.js";
import { dailySpend, type SpendStatus } from "./usage.js";

export type UserKeys = Partial<Record<ModelId, string>>;

const PLATFORM_KEY_VAR: Record<ModelId, "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "PERPLEXITY_API_KEY"> = {
  claude: "ANTHROPIC_API_KEY",
  gpt: "OPENAI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

/** Models Relay runs on its own keys for people who haven't connected theirs. */
export function includedModels(): ModelId[] {
  if (env().REQUIRE_USER_MODEL_KEYS) return [];
  return MODELS.filter((m) => Boolean(env()[PLATFORM_KEY_VAR[m]]));
}

export async function saveModelKey(userId: string, provider: ModelId, apiKey: string): Promise<void> {
  const key = apiKey.trim();
  const data = { mode: "key", keyEnc: encryptSecret(key), hint: `…${key.slice(-4)}`, invalidAt: null };
  await getPrisma().modelKey.upsert({
    where: { userId_provider: { userId, provider: toDbModel(provider) } },
    create: { userId, provider: toDbModel(provider), ...data },
    update: data,
  });
}

/**
 * Marks a provider as connected through Relay's browser: the person signed in to its app, so
 * their texts become threads in their own account, on their own subscription.
 */
export async function connectBrowserAccount(userId: string, provider: ModelId): Promise<void> {
  const data = { mode: "browser", keyEnc: null, hint: null, invalidAt: null };
  await getPrisma().modelKey.upsert({
    where: { userId_provider: { userId, provider: toDbModel(provider) } },
    create: { userId, provider: toDbModel(provider), ...data },
    update: data,
  });
}

/** Providers whose answers come from the person's own account in Relay's browser. */
export async function browserAccounts(userId: string): Promise<ModelId[]> {
  const rows = await getPrisma().modelKey.findMany({ where: { userId, mode: "browser" }, select: { provider: true } });
  return rows.map((r) => fromDbModel(r.provider));
}

export async function deleteModelKey(userId: string, provider: ModelId): Promise<void> {
  await getPrisma().modelKey.deleteMany({ where: { userId, provider: toDbModel(provider) } });
}

/** Decrypted keys that still work, by provider. */
export async function userModelKeys(userId: string): Promise<UserKeys> {
  const rows = await getPrisma().modelKey.findMany({ where: { userId, mode: "key", invalidAt: null } });
  const keys: UserKeys = {};
  for (const row of rows) if (row.keyEnc) keys[fromDbModel(row.provider)] = decryptSecret(row.keyEnc);
  return keys;
}

export async function markModelKeyInvalid(userId: string, provider: ModelId): Promise<void> {
  await getPrisma().modelKey.updateMany({
    where: { userId, provider: toDbModel(provider) },
    data: { invalidAt: new Date() },
  });
}

export async function aiAccounts(userId: string): Promise<AiAccountDTO[]> {
  const rows = await getPrisma().modelKey.findMany({ where: { userId } });
  return MODELS.map((provider) => {
    const row = rows.find((r) => fromDbModel(r.provider) === provider);
    return {
      provider,
      connected: Boolean(row),
      mode: row?.mode === "browser" ? "browser" : "key",
      hint: row?.hint ?? null,
      invalid: Boolean(row?.invalidAt),
      connectedAt: row?.createdAt.toISOString() ?? null,
    };
  });
}

export type Credential =
  | { source: "user"; apiKey: string }
  | { source: "platform" }
  | { source: "none"; reason: "not_included" | "daily_cap" };

/**
 * Whose key pays for a request: the person's own key first, then Relay's (when this model is
 * included and today's cap isn't used up).
 */
export function credentialFor(provider: ModelId, keys: UserKeys, opts: { overCap: boolean }): Credential {
  const own = keys[provider];
  if (own) return { source: "user", apiKey: own };
  if (!includedModels().includes(provider)) return { source: "none", reason: "not_included" };
  if (opts.overCap) return { source: "none", reason: "daily_cap" };
  return { source: "platform" };
}

export interface KeyRing {
  spend: SpendStatus;
  credential: (provider: ModelId) => Credential;
  /** Request options for a provider: the person's key, Relay's ({}), or null when neither may be used. */
  keyFor: (provider: ModelId) => { apiKey?: string } | null;
  /** Usage on this provider is paid by the person's own key. */
  byok: (provider: ModelId) => boolean;
}

/** Loads the person's keys and today's spend once per turn or call. */
export async function loadKeyRing(userId: string, timezone: string): Promise<KeyRing> {
  const [keys, spend] = await Promise.all([userModelKeys(userId), dailySpend(userId, timezone)]);
  const credential = (provider: ModelId) => credentialFor(provider, keys, { overCap: spend.over });
  return {
    spend,
    credential,
    keyFor: (provider) => {
      const c = credential(provider);
      return c.source === "user" ? { apiKey: c.apiKey } : c.source === "platform" ? {} : null;
    },
    byok: (provider) => Boolean(keys[provider]),
  };
}

/** Why Relay can't answer with this model for this person. */
export function noAccessMessage(provider: ModelId, reason: "not_included" | "daily_cap", opts: { voice?: boolean } = {}): string {
  const { name } = AI_PROVIDERS[provider];
  if (reason === "daily_cap") {
    return opts.voice
      ? `You've used today's included ${name} time. It resets at midnight, or connect your own ${name} account in the Relay app.`
      : `You've used today's included ${name} access. It resets at midnight, or connect your own ${name} account in the Relay app to keep going.`;
  }
  return opts.voice
    ? `${name} isn't connected yet. Open the Relay app and connect it under AI accounts.`
    : `Connect your ${name} account in the Relay app to use ${name}. It's under Settings, AI accounts.`;
}

/** What went wrong with the person's own key, and how they fix it. */
export function keyProblemMessage(provider: ModelId, problem: KeyProblem, opts: { voice?: boolean } = {}): string {
  const { name, company, billingUrl } = AI_PROVIDERS[provider];
  if (problem === "no_credit") {
    return opts.voice
      ? `Your ${company} account is out of credit, so ${name} can't answer. Add credit, then call back.`
      : `Your ${company} account is out of credit, so ${name} can't answer. Add credit at ${billingUrl}, then text me again.`;
  }
  return opts.voice
    ? `${company} stopped accepting your ${name} key. Reconnect it in the Relay app.`
    : `${company} stopped accepting your ${name} key. Reconnect ${name} in the Relay app under Settings, AI accounts.`;
}
