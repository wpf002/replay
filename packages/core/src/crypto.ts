import { createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { need } from "./env.js";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

function key(): Buffer {
  const k = Buffer.from(need("TOKEN_ENCRYPTION_KEY"), "base64");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext>, each base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(encoded: string): string {
  const [version, iv, tag, ciphertext] = encoded.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognized secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export const PIN_PATTERN = /^\d{4,8}$/;

/** scrypt with a per-PIN salt. Output: scrypt.<salt>.<hash>. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pin, salt, 32);
  return `scrypt.${salt.toString("base64url")}.${hash.toString("base64url")}`;
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split(".");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scryptAsync(pin, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}
