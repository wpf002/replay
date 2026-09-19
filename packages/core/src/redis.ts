import { Redis } from "ioredis";
import { env } from "./env.js";

let shared: Redis | undefined;

/**
 * Shared connection for rate limits and BullMQ producers.
 * maxRetriesPerRequest: null is required by BullMQ for blocking commands.
 */
export function redis(): Redis {
  if (!shared) shared = new Redis(env().REDIS_URL, { maxRetriesPerRequest: null });
  return shared;
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit();
    shared = undefined;
  }
}
