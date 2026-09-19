import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getEnv, readEnvFile, setEnv, writeEnvFile } from "./env-file.js";
import { bad, bold, note, ok, warn } from "./prompt.js";
import * as tw from "./twilio.js";

// pnpm tunnel: a Cloudflare quick tunnel to the local API. Saves the URL as PUBLIC_API_URL
// (the API and worker restart on .env changes) and points Twilio's webhooks at it.

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENV_PATH = join(ROOT, ".env");
const port = Number(process.env.API_PORT ?? 4000);

// DEV_LOGIN_CODE lets anyone sign in as any number. It must never be reachable from the internet.
if (getEnv(readEnvFile(ENV_PATH), "DEV_LOGIN_CODE")) {
  bad("DEV_LOGIN_CODE is set in .env. With a public tunnel, anyone could sign in as any number.");
  note("Clear it (Twilio Verify sends real codes once pnpm configure twilio is done), then run pnpm tunnel again.");
  process.exit(1);
}

const child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], {
  stdio: ["ignore", "pipe", "pipe"],
});

child.on("error", () => {
  bad("cloudflared isn't installed. Install it with: brew install cloudflared");
  process.exit(1);
});

let announced = false;
async function onUrl(url: string): Promise<void> {
  if (announced) return;
  announced = true;
  const env = readEnvFile(ENV_PATH);
  setEnv(env, "PUBLIC_API_URL", url);
  writeEnvFile(env);
  ok(`Tunnel up: ${bold(url)} → localhost:${port}`);
  ok("Saved PUBLIC_API_URL. A running pnpm dev restarts the API and worker to pick it up.");

  const sid = getEnv(env, "TWILIO_ACCOUNT_SID");
  const token = getEnv(env, "TWILIO_AUTH_TOKEN");
  const phone = getEnv(env, "TWILIO_PHONE_NUMBER");
  const service = getEnv(env, "TWILIO_MESSAGING_SERVICE_SID");
  if (!sid || !token || !phone || !service) {
    warn("Twilio isn't set up, so no webhooks changed. Run pnpm configure twilio.");
    return;
  }
  try {
    const client = tw.twilioFor(sid, token);
    const numberSid = await tw.numberSid(client, phone);
    if (!numberSid) return bad(`${phone} isn't on this Twilio account.`);
    // A new quick tunnel can take a few seconds to resolve; Twilio retries, so set it now.
    const hooks = await tw.syncWebhooks(client, { numberSid, messagingServiceSid: service, publicUrl: url });
    ok(`Twilio texts → ${hooks.sms}`);
    ok(`Twilio calls → ${hooks.voice}`);
  } catch (err) {
    bad(`Couldn't update Twilio: ${(err as Error).message}`);
  }
  note("Leave this running. Ctrl+C closes the tunnel.");
}

for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    const match = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(chunk);
    if (match) void onUrl(match[0]);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    child.kill("SIGTERM");
    process.exit(0);
  });
}
child.on("exit", (code) => {
  if (code) bad(`cloudflared exited with ${code}.`);
  process.exit(code ?? 0);
});
