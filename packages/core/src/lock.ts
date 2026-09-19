import { randomUUID } from "node:crypto";
import { redis } from "./redis.js";

export interface Lock {
  release(): Promise<void>;
}

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/** Single-holder Redis lock. Returns null when someone else holds it. */
export async function acquireLock(key: string, ttlMs: number): Promise<Lock | null> {
  const k = `lock:${key}`;
  const token = randomUUID();
  const ok = await redis().set(k, token, "PX", ttlMs, "NX");
  if (ok !== "OK") return null;
  return {
    async release() {
      await redis().eval(RELEASE, 1, k, token);
    },
  };
}
