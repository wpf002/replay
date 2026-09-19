import { z } from "zod";
import { NotConfiguredError } from "@relay/types";

// Blank lines in .env (`FOO=`) arrive as "". Treat them as unset.
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: optional,
  REDIS_URL: z.preprocess((v) => (v === "" ? undefined : v), z.string().default("redis://localhost:6379")),
  PUBLIC_API_URL: optional,
  PUBLIC_WEB_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().default("http://localhost:3000"),
  ),
  TOKEN_ENCRYPTION_KEY: optional,
  JWT_SECRET: optional,
  SUPPORT_EMAIL: optional,

  TWILIO_ACCOUNT_SID: optional,
  TWILIO_AUTH_TOKEN: optional,
  TWILIO_PHONE_NUMBER: optional,
  TWILIO_MESSAGING_SERVICE_SID: optional,
  TWILIO_VERIFY_SERVICE_SID: optional,

  ANTHROPIC_API_KEY: optional,
  OPENAI_API_KEY: optional,
  PERPLEXITY_API_KEY: optional,
  DEFAULT_MODEL: z.enum(["claude", "gpt", "perplexity"]).catch("claude"),
  CLAUDE_MODEL: optional,
  CLAUDE_FAST_MODEL: optional,
  OPENAI_MODEL: optional,
  OPENAI_FAST_MODEL: optional,
  PERPLEXITY_MODEL: optional,
  CLAUDE_PRICE: optional,
  CLAUDE_FAST_PRICE: optional,
  OPENAI_PRICE: optional,
  OPENAI_FAST_PRICE: optional,
  PERPLEXITY_PRICE: optional,

  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REDIRECT_URI: optional,

  DAILY_SPEND_CAP_CENTS: z.coerce.number().int().positive().catch(300),
  INVITE_ONLY: z
    .preprocess((v) => (v === "" || v === undefined ? "true" : v), z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  // true: Relay never uses its own model keys for people; everyone connects their own.
  REQUIRE_USER_MODEL_KEYS: z
    .preprocess((v) => (v === "" || v === undefined ? "false" : v), z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  DEV_LOGIN_CODE: optional,
  // Relay's web browser. Profiles hold each person's sign-ins; keep them on private disk.
  BROWSER_PROFILE_DIR: optional,
  // "chrome" uses the installed Google Chrome. Or point BROWSER_EXECUTABLE_PATH at a Chromium.
  BROWSER_CHANNEL: optional,
  BROWSER_EXECUTABLE_PATH: optional,
  // Headless Chrome trips bot checks on sites like ChatGPT far more often. Defaults to a real
  // window on macOS, headless elsewhere (a server needs Xvfb to run with a window).
  BROWSER_HEADLESS: optional,
  // Model that drives the browser. Needs the browser toolset (Claude Opus 5, Sonnet 5, Fable 5).
  COMPUTER_MODEL: optional,
  // "input/output" USD per million tokens for COMPUTER_MODEL. Defaults to CLAUDE_PRICE.
  COMPUTER_PRICE: optional,
  VOICE_TTS_PROVIDER: optional,
  VOICE_NAME: optional,
});

export type Env = z.infer<typeof schema>;
export type EnvKey = keyof Env;

let cached: Env | undefined;

/** Parsed process.env. Parsed once; call resetEnv() in tests after mutating process.env. */
export function env(): Env {
  if (!cached) {
    cached = schema.parse(process.env);
    if (cached.NODE_ENV === "production" && cached.DEV_LOGIN_CODE) {
      throw new Error("DEV_LOGIN_CODE must not be set in production");
    }
  }
  return cached;
}

export function resetEnv(): void {
  cached = undefined;
}

type StringKeys = { [K in EnvKey]: Env[K] extends string | undefined ? K : never }[EnvKey];

/** Read a variable the current code path can't run without. Throws NotConfiguredError naming it. */
export function need<K extends StringKeys>(key: K): string {
  const value = env()[key];
  if (typeof value !== "string" || value === "") throw new NotConfiguredError(key);
  return value;
}
