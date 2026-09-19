import { describe, expect, it } from "vitest";
import { parseRoute, parseSpokenRoute } from "./router.js";

describe("parseRoute", () => {
  it("uses the default model without a prefix", () => {
    expect(parseRoute("what's on tonight", "claude")).toEqual({
      model: "claude",
      text: "what's on tonight",
      explicit: false,
    });
  });

  it.each([
    ["@gpt rewrite this", "gpt", "rewrite this"],
    ["@ChatGPT: rewrite this", "gpt", "rewrite this"],
    ["@web is costco open", "perplexity", "is costco open"],
    ["  @perplexity, weather in austin", "perplexity", "weather in austin"],
    ["@claude hi", "claude", "hi"],
  ])("routes %s", (input, model, text) => {
    expect(parseRoute(input, "claude")).toMatchObject({ model, text, explicit: true });
  });

  it("leaves unknown prefixes alone", () => {
    expect(parseRoute("@sam are you free", "gpt")).toEqual({
      model: "gpt",
      text: "@sam are you free",
      explicit: false,
    });
  });

  it("returns empty text for a bare prefix", () => {
    expect(parseRoute("@web", "claude")).toMatchObject({ model: "perplexity", text: "" });
  });
});

describe("parseSpokenRoute", () => {
  it.each([
    ["Ask GPT what a good gift for my dad is", "gpt", "what a good gift for my dad is"],
    ["hey chat gpt, how far is the moon", "gpt", "how far is the moon"],
    ["search the web for Home Depot hours", "perplexity", "Home Depot hours"],
    ["Claude, what's on my calendar", "claude", "what's on my calendar"],
  ])("routes %s", (input, model, text) => {
    expect(parseSpokenRoute(input, "claude")).toMatchObject({ model, text, explicit: true });
  });

  it("keeps the default when only the model name is said", () => {
    expect(parseSpokenRoute("gpt", "claude")).toMatchObject({ model: "claude", explicit: false });
  });
});
