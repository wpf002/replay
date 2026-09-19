import { resetEnv } from "@relay/core";
import type { FastifyBaseLogger } from "fastify";
import { watch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { envEntries, readEnvFile } from "../setup/env-file.js";

const ENV_PATH = resolve(join(dirname(fileURLToPath(import.meta.url)), "../../../.."), ".env");

/**
 * Development only: picks up .env edits (pnpm configure, a new tunnel URL) without restarting.
 * Keys removed from the file keep their old value until a restart.
 */
export function watchEnvFile(log: FastifyBaseLogger): () => void {
  let timer: NodeJS.Timeout | undefined;
  try {
    const watcher = watch(ENV_PATH, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          for (const [key, value] of envEntries(readEnvFile(ENV_PATH))) process.env[key] = value;
          resetEnv();
          log.info("reloaded .env");
        } catch (err) {
          log.warn({ err }, "couldn't reload .env");
        }
      }, 150);
    });
    return () => {
      clearTimeout(timer);
      watcher.close();
    };
  } catch {
    return () => undefined;
  }
}
