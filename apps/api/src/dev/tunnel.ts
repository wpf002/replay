import { resetEnv } from "@relay/core";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyBaseLogger } from "fastify";
import { getEnv, readEnvFile, setEnv, writeEnvFile } from "../setup/env-file.js";
import * as tw from "../setup/twilio.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ENV_PATH = join(ROOT, ".env");
const QUICK_TUNNEL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export const isPublicUrl = (url: string | undefined): url is string =>
  Boolean(url && /^https:\/\//.test(url) && !/your-tunnel|localhost|127\.0\.0\.1/.test(url));

/** A quick tunnel's URL dies with the tunnel, so a leftover one in .env means nothing. */
const isQuickTunnel = (url: string | undefined) => Boolean(url && QUICK_TUNNEL.test(url));

export interface Tunnel {
  url: Promise<string>;
  /** Set once the tunnel is up. */
  publicUrl: string | null;
  stop: () => void;
}

/**
 * A Cloudflare quick tunnel to this server, so Twilio can reach it in development. The URL is
 * new every run: it goes into process.env for this server, into .env for the worker, and into
 * Twilio's webhooks.
 */
export function openTunnel(port: number): Tunnel {
  let child: ChildProcess;
  let settled = false;

  const url = new Promise<string>((resolve, reject) => {
    child = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${port}`], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", () => {
      settled = true;
      reject(new Error("cloudflared isn't installed. Install it with: brew install cloudflared"));
    });
    child.on("exit", (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`cloudflared exited with ${code ?? 0}`));
      }
    });
    for (const stream of [child.stdout, child.stderr]) {
      stream?.setEncoding("utf8");
      stream?.on("data", (chunk: string) => {
        const match = QUICK_TUNNEL.exec(chunk);
        if (match && !settled) {
          settled = true;
          resolve(match[0]);
        }
      });
    }
  });

  const tunnel: Tunnel = { url, publicUrl: null, stop: () => child?.kill("SIGTERM") };
  void url.then((value) => (tunnel.publicUrl = value)).catch(() => undefined);
  return tunnel;
}

/** Saves the public URL where this server, the worker, and Twilio will each find it. */
export async function publish(url: string, log: FastifyBaseLogger): Promise<void> {
  process.env.PUBLIC_API_URL = url;
  resetEnv();
  const env = readEnvFile(ENV_PATH);
  setEnv(env, "PUBLIC_API_URL", url);
  writeEnvFile(env);

  const sid = getEnv(env, "TWILIO_ACCOUNT_SID");
  const token = getEnv(env, "TWILIO_AUTH_TOKEN");
  const phone = getEnv(env, "TWILIO_PHONE_NUMBER");
  const service = getEnv(env, "TWILIO_MESSAGING_SERVICE_SID");
  if (!sid || !token || !phone || !service) {
    log.warn("Twilio isn't set up, so no webhooks changed. Run pnpm configure twilio.");
    return;
  }
  const client = tw.twilioFor(sid, token);
  const numberSid = await tw.numberSid(client, phone);
  if (!numberSid) {
    log.error({ phone }, "that number isn't on this Twilio account, so webhooks weren't changed");
    return;
  }
  const hooks = await tw.syncWebhooks(client, { numberSid, messagingServiceSid: service, publicUrl: url });
  log.info({ sms: hooks.sms, voice: hooks.voice }, "Twilio webhooks point here");
}

/**
 * Development only: gives this server a public address without anyone running a second command.
 * Skipped in production and whenever PUBLIC_API_URL is already a real URL.
 */
export async function startDevTunnel(port: number, log: FastifyBaseLogger): Promise<Tunnel | null> {
  if (process.env.NODE_ENV === "production") return null;
  if (isPublicUrl(process.env.PUBLIC_API_URL) && !isQuickTunnel(process.env.PUBLIC_API_URL)) {
    log.info({ url: process.env.PUBLIC_API_URL }, "public URL already set; no tunnel");
    return null;
  }
  // DEV_LOGIN_CODE lets anyone sign in as any number; it must never be reachable from the internet.
  if (getEnv(readEnvFile(ENV_PATH), "DEV_LOGIN_CODE")) {
    log.warn("DEV_LOGIN_CODE is set, so no tunnel. Clear it once Twilio Verify works, or texts can't reach you.");
    return null;
  }

  const tunnel = openTunnel(port);
  try {
    const url = await tunnel.url;
    await publish(url, log);
    log.info({ url }, "tunnel open");
    return tunnel;
  } catch (err) {
    tunnel.stop();
    log.warn({ err: (err as Error).message }, "no tunnel, so Twilio can't reach this machine");
    return null;
  }
}
