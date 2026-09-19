import { afterEach, describe, expect, it } from "vitest";
import { resetEnv } from "./env.js";
import { credentialFor, includedModels, keyProblemMessage, noAccessMessage } from "./model-keys.js";

const saved = { ...process.env };
function setEnv(values: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetEnv();
}

afterEach(() => {
  process.env = { ...saved };
  resetEnv();
});

describe("includedModels", () => {
  it("lists models Relay has its own key for", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: undefined, PERPLEXITY_API_KEY: "pplx-x", REQUIRE_USER_MODEL_KEYS: undefined });
    expect(includedModels()).toEqual(["claude", "perplexity"]);
  });

  it("is empty when everyone brings their own keys", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant-x", REQUIRE_USER_MODEL_KEYS: "true" });
    expect(includedModels()).toEqual([]);
  });
});

describe("credentialFor", () => {
  it("prefers the person's own key, even over the cap", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant-x", REQUIRE_USER_MODEL_KEYS: undefined });
    expect(credentialFor("claude", { claude: "sk-ant-own" }, { overCap: true })).toEqual({ source: "user", apiKey: "sk-ant-own" });
  });

  it("falls back to Relay's key within the daily cap", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant-x", REQUIRE_USER_MODEL_KEYS: undefined });
    expect(credentialFor("claude", {}, { overCap: false })).toEqual({ source: "platform" });
    expect(credentialFor("claude", {}, { overCap: true })).toEqual({ source: "none", reason: "daily_cap" });
  });

  it("needs the person's key for models Relay doesn't include", () => {
    setEnv({ ANTHROPIC_API_KEY: "sk-ant-x", OPENAI_API_KEY: undefined, REQUIRE_USER_MODEL_KEYS: undefined });
    expect(credentialFor("gpt", {}, { overCap: false })).toEqual({ source: "none", reason: "not_included" });
    setEnv({ REQUIRE_USER_MODEL_KEYS: "true" });
    expect(credentialFor("claude", {}, { overCap: false })).toEqual({ source: "none", reason: "not_included" });
  });
});

describe("messages", () => {
  it("says how to get access back", () => {
    expect(noAccessMessage("gpt", "not_included")).toBe(
      "Connect your ChatGPT account in the Relay app to use ChatGPT. It's under Settings, AI accounts.",
    );
    expect(noAccessMessage("claude", "daily_cap")).toContain("resets at midnight");
    expect(keyProblemMessage("claude", "no_credit")).toContain("https://console.anthropic.com/settings/billing");
    expect(keyProblemMessage("perplexity", "rejected", { voice: true })).not.toContain("http");
  });
});
