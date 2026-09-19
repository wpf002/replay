import Anthropic from "@anthropic-ai/sdk";
import { detectKeyProvider, ProviderKeyError } from "@relay/types";
import { describe, expect, it } from "vitest";
import { keyHint, keyProblem, rethrowKeyError } from "./keys.js";

const apiError = (status: number, message: string, code?: string) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

describe("detectKeyProvider", () => {
  it("tells providers apart by prefix", () => {
    expect(detectKeyProvider("sk-ant-api03-abcdefghijklmnop")).toBe("claude");
    expect(detectKeyProvider("pplx-abcdefghijklmnop")).toBe("perplexity");
    expect(detectKeyProvider("sk-proj-abcdefghijklmnopqrstuv")).toBe("gpt");
    expect(detectKeyProvider("  sk-abcdefghijklmnopqrst  ")).toBe("gpt");
    expect(detectKeyProvider("hello")).toBeNull();
  });
});

describe("keyProblem", () => {
  it("treats 401 as a rejected key", () => {
    expect(keyProblem(apiError(401, "invalid x-api-key"))).toBe("rejected");
    expect(keyProblem(new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()))).toBe("rejected");
  });

  it("recognizes accounts without credit", () => {
    expect(keyProblem(apiError(400, "Your credit balance is too low to access the Anthropic API."))).toBe("no_credit");
    expect(keyProblem(apiError(429, "You exceeded your current quota", "insufficient_quota"))).toBe("no_credit");
    expect(keyProblem(apiError(402, "Payment required"))).toBe("no_credit");
  });

  it("leaves other failures alone", () => {
    expect(keyProblem(apiError(429, "Rate limit reached"))).toBeNull();
    expect(keyProblem(apiError(404, "model not found"))).toBeNull();
    expect(keyProblem(apiError(500, "overloaded"))).toBeNull();
  });
});

describe("rethrowKeyError", () => {
  it("wraps key problems only for a person's own key", () => {
    const err = apiError(401, "bad key");
    expect(() => rethrowKeyError("gpt", "sk-own", err)).toThrow(ProviderKeyError);
    expect(() => rethrowKeyError("gpt", undefined, err)).toThrow(err);
  });
});

it("shows only the last four characters", () => {
  expect(keyHint(" sk-ant-api03-secretWXYZ ")).toBe("…WXYZ");
});
