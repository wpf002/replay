import { describe, expect, it } from "vitest";
import { envText, getEnv, parseEnv, setEnv } from "./env-file.js";

const SAMPLE = `# ── Core ──
NODE_ENV=development
# Postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/relay
TWILIO_AUTH_TOKEN=
QUOTED="has spaces # not a comment"
INLINE=value # trailing comment
`;

describe("env file", () => {
  it("reads values, treating blanks as unset", () => {
    const file = parseEnv(SAMPLE);
    expect(getEnv(file, "DATABASE_URL")).toBe("postgresql://postgres:postgres@localhost:5432/relay");
    expect(getEnv(file, "TWILIO_AUTH_TOKEN")).toBeUndefined();
    expect(getEnv(file, "QUOTED")).toBe("has spaces # not a comment");
    expect(getEnv(file, "INLINE")).toBe("value");
    expect(getEnv(file, "MISSING")).toBeUndefined();
  });

  it("replaces a key in place and keeps comments and order", () => {
    const file = parseEnv(SAMPLE);
    setEnv(file, "TWILIO_AUTH_TOKEN", "abc123");
    const text = envText(file);
    expect(text).toContain("# Postgres\nDATABASE_URL=");
    expect(text).toContain("TWILIO_AUTH_TOKEN=abc123\nQUOTED=");
  });

  it("appends new keys and quotes values that need it", () => {
    const file = parseEnv(SAMPLE);
    setEnv(file, "LEGAL_ENTITY", "Relay Labs, LLC");
    setEnv(file, "SUPPORT_EMAIL", "help@relay.example");
    const text = envText(file);
    expect(text.endsWith('LEGAL_ENTITY="Relay Labs, LLC"\nSUPPORT_EMAIL=help@relay.example\n')).toBe(true);
    expect(getEnv(parseEnv(text), "LEGAL_ENTITY")).toBe("Relay Labs, LLC");
  });
});
