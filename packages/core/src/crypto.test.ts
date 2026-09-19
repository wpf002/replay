import { beforeAll, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashPin, verifyPinHash } from "./crypto.js";
import { resetEnv } from "./env.js";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  resetEnv();
});

describe("token encryption", () => {
  it("round-trips and never repeats ciphertext", () => {
    const a = encryptSecret("ya29.refresh-token");
    const b = encryptSecret("ya29.refresh-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("refresh-token");
    expect(decryptSecret(a)).toBe("ya29.refresh-token");
  });

  it("rejects tampered ciphertext", () => {
    const parts = encryptSecret("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("PIN hashing", () => {
  it("verifies the right PIN only", async () => {
    const stored = await hashPin("4821");
    expect(await verifyPinHash("4821", stored)).toBe(true);
    expect(await verifyPinHash("4822", stored)).toBe(false);
    expect(stored).not.toContain("4821");
  });
});
