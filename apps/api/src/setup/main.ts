import { checkKey, detectProvider, keyHint } from "@relay/providers";
import type { ModelId } from "@relay/types";
import OpenAI from "openai";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getEnv, readEnvFile, setEnv, writeEnvFile, type EnvFile } from "./env-file.js";
import { checkGoogleClient, checkGoogleSecret } from "./google.js";
import { ask, bad, bold, choose, confirm, dim, heading, note, ok, openUrl, secret, warn } from "./prompt.js";
import { probeModel } from "./probe.js";
import * as tw from "./twilio.js";

// pnpm configure                walk through everything that's missing
// pnpm configure <step>          one step: claude, gpt, perplexity, twilio, google, url, support
// pnpm configure --check         verify every configured key against the live services
// pnpm configure twilio-sync     point Twilio's webhooks at the current PUBLIC_API_URL

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENV_PATH = join(ROOT, ".env");
const EXAMPLE_PATH = join(ROOT, ".env.example");

const load = (): EnvFile => readEnvFile(ENV_PATH, EXAMPLE_PATH);
function save(env: EnvFile, values: Record<string, string>): void {
  for (const [k, v] of Object.entries(values)) setEnv(env, k, v);
  writeEnvFile(env);
}

const isPublicUrl = (url: string | undefined): url is string =>
  Boolean(url && /^https:\/\//.test(url) && !/your-tunnel|localhost|127\.0\.0\.1/.test(url));

// ── Model providers ──────────────────────────────────

const MODELS: Record<
  ModelId,
  { title: string; keyVar: string; url: string; why: string; required: boolean }
> = {
  claude: {
    title: "Claude (Anthropic)",
    keyVar: "ANTHROPIC_API_KEY",
    url: "https://console.anthropic.com/settings/keys",
    why: "The default brain for texts and calls.",
    required: true,
  },
  gpt: {
    title: "ChatGPT (OpenAI)",
    keyVar: "OPENAI_API_KEY",
    url: "https://platform.openai.com/api-keys",
    why: "Answers texts that start with @gpt, and anyone who picks GPT as their default.",
    required: false,
  },
  perplexity: {
    title: "Perplexity",
    keyVar: "PERPLEXITY_API_KEY",
    url: "https://console.perplexity.ai/project/keys",
    why: "Live web answers for @web and the web_search tool the other models use.",
    required: false,
  },
};

// [model variable, price variable] per provider.
const MODEL_VARS: Record<ModelId, [string, string][]> = {
  claude: [["CLAUDE_MODEL", "CLAUDE_PRICE"], ["CLAUDE_FAST_MODEL", "CLAUDE_FAST_PRICE"]],
  gpt: [["OPENAI_MODEL", "OPENAI_PRICE"], ["OPENAI_FAST_MODEL", "OPENAI_FAST_PRICE"]],
  perplexity: [["PERPLEXITY_MODEL", "PERPLEXITY_PRICE"]],
};

// Setup-time defaults only. Runtime reads the *_PRICE variables.
const CLAUDE_PRICES: Record<string, string> = {
  "claude-opus-5": "5/25",
  "claude-sonnet-5": "2/10",
  "claude-haiku-4-5": "1/5",
  "claude-fable-5-1": "10/50",
};

const claudePrice = (id: string) =>
  Object.entries(CLAUDE_PRICES).find(([k]) => id === k || id.startsWith(`${k}-`))?.[1];

/** Lets the operator pick a model, then confirms it answers a tiny request before keeping it. */
async function pickModel(
  provider: ModelId,
  apiKey: string,
  label: string,
  ids: string[],
  preferred: string[],
): Promise<string | null> {
  let candidates = ids;
  for (;;) {
    if (!candidates.length) {
      bad("None of the listed models answered. Set the model in .env by hand.");
      return null;
    }
    const first = preferred.find((p) => candidates.includes(p)) ?? candidates[0]!;
    const shown = [first, ...candidates.filter((id) => id !== first)].slice(0, 8);
    const choice = await choose(label, shown.map((id, i) => ({ key: String(i + 1), label: id === first ? `${id} ${dim("(suggested)")}` : id })));
    const model = shown[Number(choice) - 1]!;
    process.stdout.write(`  ${dim(`Sending ${model} a one-line test…`)}\r`);
    const probe = await probeModel(provider, apiKey, model);
    if (probe.ok) {
      ok(`${model} answers.`);
      return model;
    }
    bad(`${model} didn't work for chat: ${probe.message}`);
    candidates = candidates.filter((id) => id !== model);
  }
}

const PRICE = /^\d+(\.\d+)?\/\d+(\.\d+)?$/;

async function askPrice(model: string, current?: string): Promise<string | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await ask(`Price for ${model}, input/output USD per million tokens, like 2.50/10 (Enter to skip)`, current);
    if (!answer) return undefined;
    if (PRICE.test(answer)) return answer;
    warn("Use two numbers separated by a slash, like 2.50/10.");
  }
  warn("Skipped. Relay counts unknown prices as 15/75 so the spend cap stays safe.");
  return undefined;
}

async function modelStep(provider: ModelId): Promise<void> {
  const info = MODELS[provider];
  const env = load();
  heading(info.title);
  note(info.why);
  const existing = getEnv(env, info.keyVar);
  let key = "";
  let models: string[] = [];

  // Keeping the saved key still walks through model choice, so re-running a step fixes a bad pick.
  if (existing && !(await confirm(`A key (${keyHint(existing)}) is already saved. Replace it?`))) {
    const check = await checkKey(provider, existing);
    if (!check.ok) return bad(`The saved key fails: ${check.message}`);
    key = existing;
    models = check.models ?? [];
  } else {
    console.log(`  Create a key named "Relay" on the page that opens, copy it, then paste it here.`);
    openUrl(info.url);
  }

  for (let attempt = 0; attempt < 3 && !key; attempt++) {
    key = await secret("Paste the key");
    if (!key) return warn("Skipped.");
    const detected = detectProvider(key);
    if (detected && detected !== provider) warn(`That looks like a ${MODELS[detected].title} key.`);
    process.stdout.write(`  ${dim("Checking…")}\r`);
    const check = await checkKey(provider, key);
    if (check.ok) {
      models = check.models ?? [];
      ok(`Key works (${keyHint(key)}).`);
      break;
    }
    bad(check.message);
    key = "";
  }
  if (!key) return warn("No key saved.");
  save(env, { [info.keyVar]: key });

  if (provider === "claude") {
    const values: Record<string, string> = {};
    const main = await pickModel("claude", key, "Model for texts", models, ["claude-opus-5", "claude-sonnet-5"]);
    const fast = await pickModel("claude", key, "Faster model for calls", models, ["claude-haiku-4-5", "claude-sonnet-5"]);
    if (main) values.CLAUDE_MODEL = main;
    if (fast) values.CLAUDE_FAST_MODEL = fast;
    const mainPrice = main ? claudePrice(main) : undefined;
    const fastPrice = fast ? claudePrice(fast) : undefined;
    if (mainPrice) values.CLAUDE_PRICE = mainPrice;
    if (fastPrice) values.CLAUDE_FAST_PRICE = fastPrice;
    save(env, values);
  }

  if (provider === "gpt") {
    const client = new OpenAI({ apiKey: key, baseURL: "https://api.openai.com/v1" });
    const all = (await client.models.list()).data;
    const chat = all
      .filter((m) => /^(gpt-|o\d)/.test(m.id) && !/(audio|realtime|live|tts|transcribe|image|embed|search|moderation|instruct|codex)/.test(m.id))
      .sort((a, b) => b.created - a.created)
      .map((m) => m.id);
    const values: Record<string, string> = {};
    const main = await pickModel("gpt", key, "Model for texts", chat, chat.filter((id) => !/mini|nano|pro/.test(id)));
    const fast = await pickModel("gpt", key, "Faster model for calls", chat, chat.filter((id) => /mini|nano/.test(id)));
    if (main) values.OPENAI_MODEL = main;
    if (fast) values.OPENAI_FAST_MODEL = fast;
    note("Prices feed the daily spend cap. Opening OpenAI's pricing page.");
    openUrl("https://openai.com/api/pricing");
    const mainPrice = main ? await askPrice(main, getEnv(env, "OPENAI_PRICE")) : undefined;
    const fastPrice = fast ? await askPrice(fast, getEnv(env, "OPENAI_FAST_PRICE")) : undefined;
    if (mainPrice) values.OPENAI_PRICE = mainPrice;
    if (fastPrice) values.OPENAI_FAST_PRICE = fastPrice;
    save(env, values);
  }

  if (provider === "perplexity") {
    const model = getEnv(env, "PERPLEXITY_MODEL") ?? "sonar-pro";
    const probe = await probeModel("perplexity", key, model);
    if (probe.ok) ok(`${model} answers.`);
    else bad(`${model} didn't answer: ${probe.message}`);
    save(env, {
      PERPLEXITY_MODEL: model,
      ...(model === "sonar-pro" && !getEnv(env, "PERPLEXITY_PRICE") ? { PERPLEXITY_PRICE: "3/15" } : {}),
    });
  }
}

// ── Public URL ───────────────────────────────────────

async function urlStep(): Promise<void> {
  const env = load();
  heading("Public URL");
  note("Twilio has to reach your API over HTTPS.");
  note(`For local development, run ${bold("pnpm tunnel")} in its own terminal. It opens a Cloudflare tunnel,`);
  note("saves the URL here, and points Twilio at it every time it starts.");
  const current = getEnv(env, "PUBLIC_API_URL");
  const url = await ask(
    "Paste a public https URL, or press Enter to skip and use pnpm tunnel",
    isPublicUrl(current) ? current : undefined,
  );
  if (!url) return;
  if (!isPublicUrl(url)) return bad("Use an https:// URL that Twilio can reach.");
  save(env, { PUBLIC_API_URL: url.replace(/\/+$/, "") });
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/health`);
    if (res.ok) ok("The API answers at that URL.");
    else warn(`The API answered ${res.status}. Start it with pnpm dev.`);
  } catch {
    warn("Nothing answers there yet. Start the API with pnpm dev.");
  }
}

// ── Twilio ───────────────────────────────────────────

async function twilioStep(): Promise<void> {
  const env = load();
  heading("Twilio: the number people text and call");
  note("Account SID and Auth Token are on the Twilio Console home page under Account Info.");
  openUrl("https://console.twilio.com");

  const accountSid = await ask("Account SID (starts with AC)", getEnv(env, "TWILIO_ACCOUNT_SID"));
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) return bad("That isn't an Account SID.");
  const savedToken = getEnv(env, "TWILIO_AUTH_TOKEN");
  const authToken = (await secret(savedToken ? "Auth Token (Enter keeps the saved one)" : "Auth Token")) || savedToken || "";

  const client = tw.twilioFor(accountSid, authToken);
  let account;
  try {
    account = await tw.describeAccount(client, accountSid);
  } catch {
    return bad("Twilio rejected that Account SID and Auth Token.");
  }
  ok(`Signed in to "${account.name}".`);
  if (account.trial) warn("Trial account: it can only text and call numbers you've verified in the console.");
  save(env, { TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken });

  const owned = (await tw.ownedNumbers(client)).filter((n) => n.sms && n.voice);
  const saved = getEnv(env, "TWILIO_PHONE_NUMBER");
  const options = owned.map((n, i) => ({ key: String(i + 1), label: `${n.phoneNumber}${n.phoneNumber === saved ? dim(" (current)") : ""}` }));
  options.push({ key: "b", label: "Buy a new number" });
  const pick = await choose("Which number is Relay?", options);

  let number: tw.OwnedNumber;
  if (pick === "b") {
    const area = await ask("Area code (optional)");
    const found = await tw.searchNumbers(client, area ? Number(area) : undefined);
    if (!found.length) return bad("No numbers with SMS and voice found there. Try another area code.");
    const which = await choose("Pick a number", found.map((n, i) => ({ key: String(i + 1), label: n })));
    const chosen = found[Number(which) - 1]!;
    const price = await tw.localNumberPrice(client);
    const cost = price ? `$${price.toFixed(2)} a month` : "Twilio's monthly number price";
    if (!(await confirm(`Buy ${chosen} for ${cost}? This charges your Twilio account.`))) return warn("Nothing bought.");
    number = await tw.buyNumber(client, chosen);
    ok(`Bought ${number.phoneNumber}.`);
  } else {
    number = owned[Number(pick) - 1]!;
  }

  const verify = await tw.ensureVerifyService(client);
  ok(`${verify.created ? "Created" : "Using"} Verify service ${verify.sid} for sign-in codes.`);
  let messaging;
  try {
    messaging = await tw.ensureMessagingService(client, number.sid);
  } catch (err) {
    return bad(`Couldn't add the number to the "Relay" Messaging Service: ${(err as Error).message}`);
  }
  ok(`${messaging.created ? "Created" : "Using"} Messaging Service ${messaging.sid}.`);

  save(env, {
    TWILIO_PHONE_NUMBER: number.phoneNumber,
    EXPO_PUBLIC_RELAY_NUMBER: number.phoneNumber,
    TWILIO_VERIFY_SERVICE_SID: verify.sid,
    TWILIO_MESSAGING_SERVICE_SID: messaging.sid,
  });
  if (getEnv(env, "DEV_LOGIN_CODE") && (await confirm("Real sign-in codes work now. Clear DEV_LOGIN_CODE?", true))) {
    save(env, { DEV_LOGIN_CODE: "" });
    ok("Cleared DEV_LOGIN_CODE.");
  }

  const publicUrl = getEnv(load(), "PUBLIC_API_URL");
  if (isPublicUrl(publicUrl)) {
    const hooks = await tw.syncWebhooks(client, { numberSid: number.sid, messagingServiceSid: messaging.sid, publicUrl });
    ok(`Texts go to ${hooks.sms}`);
    ok(`Calls go to ${hooks.voice}`);
  } else {
    warn(`Webhooks not set yet: no public URL. Run ${bold("pnpm tunnel")} and it sets them.`);
  }

  console.log(`\n  Two things Twilio only lets you do in the console:`);
  note(`1. Messaging Service → Opt-Out Management: remove YES from the opt-in keywords (Relay uses YES to approve).`);
  note(`2. Register A2P 10DLC before texting US numbers at volume. Needs /privacy and /terms live.`);
  if (await confirm("Open the Messaging Service now?", true)) {
    openUrl(`https://console.twilio.com/us1/develop/sms/services/${messaging.sid}/opt-out-management`);
  }
}

async function twilioSync(quiet = false): Promise<boolean> {
  const env = load();
  const sid = getEnv(env, "TWILIO_ACCOUNT_SID");
  const token = getEnv(env, "TWILIO_AUTH_TOKEN");
  const phone = getEnv(env, "TWILIO_PHONE_NUMBER");
  const service = getEnv(env, "TWILIO_MESSAGING_SERVICE_SID");
  const url = getEnv(env, "PUBLIC_API_URL");
  if (!sid || !token || !phone || !service) {
    if (!quiet) warn("Twilio isn't set up yet. Run pnpm configure twilio.");
    return false;
  }
  if (!isPublicUrl(url)) {
    if (!quiet) warn("PUBLIC_API_URL isn't a public https URL.");
    return false;
  }
  const client = tw.twilioFor(sid, token);
  const numberSid = await tw.numberSid(client, phone);
  if (!numberSid) {
    bad(`${phone} isn't on this Twilio account.`);
    return false;
  }
  const hooks = await tw.syncWebhooks(client, { numberSid, messagingServiceSid: service, publicUrl: url });
  ok(`Twilio webhooks → ${hooks.sms.replace("/twilio/sms", "")}`);
  return true;
}

// ── Google ───────────────────────────────────────────

async function googleStep(): Promise<void> {
  const env = load();
  heading("Google: Gmail and Calendar");
  const saved = getEnv(env, "GOOGLE_REDIRECT_URI");
  const redirectUri = saved ?? "http://localhost:4000/oauth/google/callback";
  console.log("  In Google Cloud Console:");
  note("1. Pick or create a project.");
  note("2. Enable the Gmail API and the Google Calendar API.");
  note("3. Google Auth Platform: set up the consent screen as External and add yourself as a test user.");
  note("   Data access: add gmail.readonly, gmail.send, and calendar.events.");
  note(`4. Clients → Create client → Web application → Authorized redirect URI:`);
  console.log(`       ${bold(redirectUri)}`);
  note("   localhost works for development and doesn't change when your tunnel URL does.");
  if (await confirm("Open those pages?", true)) {
    openUrl("https://console.cloud.google.com/apis/library/gmail.googleapis.com");
    openUrl("https://console.cloud.google.com/apis/library/calendar-json.googleapis.com");
    openUrl("https://console.cloud.google.com/auth/clients");
  }

  const clientId = await ask("Client ID", getEnv(env, "GOOGLE_CLIENT_ID"));
  if (!clientId.endsWith(".apps.googleusercontent.com")) return bad("Client IDs end in .apps.googleusercontent.com.");
  const client = await checkGoogleClient(clientId, redirectUri);
  if (!client.ok) return bad(client.message);
  ok("Client ID and redirect URI accepted.");

  const savedSecret = getEnv(env, "GOOGLE_CLIENT_SECRET");
  const clientSecret = (await secret(savedSecret ? "Client secret (Enter keeps the saved one)" : "Client secret")) || savedSecret || "";
  const check = await checkGoogleSecret(clientId, clientSecret, redirectUri);
  if (!check.ok) return bad(check.message);
  ok("Client secret works.");
  save(env, { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, GOOGLE_REDIRECT_URI: redirectUri });
}

// ── Support details and generated secrets ────────────

async function supportStep(): Promise<void> {
  const env = load();
  heading("Support contact and legal name");
  note("Shown in HELP replies and on /privacy and /terms. 10DLC registration checks them.");
  const email = await ask("Support email", getEnv(env, "SUPPORT_EMAIL"));
  const entity = await ask("Legal name that runs Relay (company or your name)", getEnv(env, "LEGAL_ENTITY"));
  save(env, { ...(email ? { SUPPORT_EMAIL: email } : {}), ...(entity ? { LEGAL_ENTITY: entity } : {}) });
}

function ensureSecrets(): void {
  const env = load();
  const values: Record<string, string> = {};
  // Never replace an existing encryption key: stored OAuth tokens would become unreadable.
  if (!getEnv(env, "TOKEN_ENCRYPTION_KEY")) values.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  if (!getEnv(env, "JWT_SECRET")) values.JWT_SECRET = randomBytes(48).toString("base64");
  if (Object.keys(values).length) {
    save(env, values);
    ok(`Generated ${Object.keys(values).join(" and ")}.`);
  }
}

// ── Status and checks ────────────────────────────────

interface Item {
  key: string;
  label: string;
  required: boolean;
  done: (env: EnvFile) => boolean;
  run: () => Promise<unknown>;
}

const ITEMS: Item[] = [
  { key: "claude", label: "Claude key", required: true, done: (e) => Boolean(getEnv(e, "ANTHROPIC_API_KEY")), run: () => modelStep("claude") },
  { key: "gpt", label: "ChatGPT key", required: false, done: (e) => Boolean(getEnv(e, "OPENAI_API_KEY")), run: () => modelStep("gpt") },
  { key: "perplexity", label: "Perplexity key", required: false, done: (e) => Boolean(getEnv(e, "PERPLEXITY_API_KEY")), run: () => modelStep("perplexity") },
  { key: "url", label: "Public URL", required: true, done: (e) => isPublicUrl(getEnv(e, "PUBLIC_API_URL")), run: urlStep },
  { key: "twilio", label: "Twilio", required: true, done: (e) => Boolean(getEnv(e, "TWILIO_MESSAGING_SERVICE_SID") && getEnv(e, "TWILIO_VERIFY_SERVICE_SID")), run: twilioStep },
  { key: "google", label: "Google OAuth", required: false, done: (e) => Boolean(getEnv(e, "GOOGLE_CLIENT_SECRET")), run: googleStep },
  { key: "support", label: "Support email and legal name", required: true, done: (e) => Boolean(getEnv(e, "SUPPORT_EMAIL") && getEnv(e, "LEGAL_ENTITY")), run: supportStep },
];

function printStatus(): void {
  const env = load();
  heading("Relay setup");
  note(`Writes to ${ENV_PATH}. Keys stay on this machine.`);
  console.log("");
  for (const item of ITEMS) {
    const mark = item.done(env) ? "✓" : item.required ? "✗" : "·";
    console.log(`  ${mark} ${item.label}${item.required ? "" : dim(" (optional)")}  ${dim(`pnpm configure ${item.key}`)}`);
  }
}

async function doctor(): Promise<void> {
  const env = load();
  heading("Checking configured services");
  for (const provider of Object.keys(MODELS) as ModelId[]) {
    const key = getEnv(env, MODELS[provider].keyVar);
    if (!key) {
      (MODELS[provider].required ? bad : note)(`${MODELS[provider].title}: no key`);
      continue;
    }
    const check = await checkKey(provider, key);
    if (!check.ok) {
      bad(`${MODELS[provider].title}: ${check.message}`);
      continue;
    }
    ok(`${MODELS[provider].title}: key works (${keyHint(key)})`);
    // One tiny request per configured model, so a wrong model ID shows up here instead of in a text.
    for (const [modelVar, priceVar] of MODEL_VARS[provider]) {
      const model = getEnv(env, modelVar);
      if (!model) continue;
      const probe = await probeModel(provider, key, model);
      if (!probe.ok) bad(`  ${modelVar}=${model}: ${probe.message}`);
      else if (!getEnv(env, priceVar)) warn(`  ${modelVar}=${model} answers, but ${priceVar} is unset (counted as 15/75)`);
      else ok(`  ${modelVar}=${model} answers`);
    }
  }

  const sid = getEnv(env, "TWILIO_ACCOUNT_SID");
  const token = getEnv(env, "TWILIO_AUTH_TOKEN");
  const phone = getEnv(env, "TWILIO_PHONE_NUMBER");
  if (sid && token && phone) {
    try {
      const client = tw.twilioFor(sid, token);
      const account = await tw.describeAccount(client, sid);
      const nSid = await tw.numberSid(client, phone);
      if (!nSid) bad(`Twilio: ${phone} isn't on account "${account.name}"`);
      else {
        const hooks = await tw.readWebhooks(client, { numberSid: nSid, ...(getEnv(env, "TWILIO_MESSAGING_SERVICE_SID") ? { messagingServiceSid: getEnv(env, "TWILIO_MESSAGING_SERVICE_SID")! } : {}) });
        const url = getEnv(env, "PUBLIC_API_URL") ?? "";
        const aligned = hooks.sms?.startsWith(url) && hooks.voice?.startsWith(url);
        (aligned ? ok : warn)(`Twilio: ${phone} on "${account.name}"${aligned ? "" : `, webhooks point at ${hooks.sms ?? "nothing"} (run pnpm configure twilio-sync)`}`);
      }
    } catch {
      bad("Twilio: credentials rejected");
    }
  } else bad("Twilio: not set up");

  const gId = getEnv(env, "GOOGLE_CLIENT_ID");
  const gSecret = getEnv(env, "GOOGLE_CLIENT_SECRET");
  if (gId && gSecret) {
    const redirect = getEnv(env, "GOOGLE_REDIRECT_URI") ?? `${getEnv(env, "PUBLIC_API_URL")}/oauth/google/callback`;
    const c = await checkGoogleClient(gId, redirect);
    const s = c.ok ? await checkGoogleSecret(gId, gSecret, redirect) : c;
    (s.ok ? ok : bad)(`Google: ${s.ok ? "client, secret, and redirect URI accepted" : s.message}`);
  } else note("Google: not set up");

  const url = getEnv(env, "PUBLIC_API_URL");
  if (isPublicUrl(url)) {
    try {
      const res = await fetch(`${url}/health`);
      (res.ok ? ok : warn)(`Public URL: ${url} answered ${res.status}`);
    } catch {
      warn(`Public URL: nothing answers at ${url}`);
    }
  } else bad("Public URL: not set (run pnpm tunnel)");

  for (const k of ["SUPPORT_EMAIL", "LEGAL_ENTITY"]) (getEnv(env, k) ? ok : bad)(`${k}${getEnv(env, k) ? "" : ": missing"}`);
}

// ── Entry ────────────────────────────────────────────

const [command] = process.argv.slice(2).filter((a) => a !== "--");
ensureSecrets();

if (command === "--check" || command === "check") {
  await doctor();
} else if (command === "twilio-sync") {
  await twilioSync();
} else if (command) {
  const item = ITEMS.find((i) => i.key === command);
  if (!item) {
    bad(`Unknown step "${command}". Steps: ${ITEMS.map((i) => i.key).join(", ")}, --check, twilio-sync`);
    process.exitCode = 1;
  } else await item.run();
} else {
  printStatus();
  for (const item of ITEMS) {
    if (item.done(load())) continue;
    if (await confirm(`\nSet up ${item.label} now?`, item.required)) await item.run();
  }
  printStatus();
  console.log(`\n  Verify everything with ${bold("pnpm configure --check")}.`);
}
