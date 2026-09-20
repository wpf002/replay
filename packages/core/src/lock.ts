import { randomUUID } from "node:crypto";
import { redis } from "./redis.js";

export interface Lock {
  /** Pushes the expiry out while the holder is still working. */
  extend(ttlMs: number): Promise<void>;
  release(): Promise<void>;
}

const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
const EXTEND = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;

/** Single-holder Redis lock. Returns null when someone else holds it. */
export async function acquireLock(key: string, ttlMs: number): Promise<Lock | null> {
  const k = `lock:${key}`;
  const token = randomUUID();
  const ok = await redis().set(k, token, "PX", ttlMs, "NX");
  if (ok !== "OK") return null;
  return {
    async extend(ms: number) {
      await redis().eval(EXTEND, 1, k, token, String(ms));
    },
    async release() {
      await redis().eval(RELEASE, 1, k, token);
    },
  };
}
