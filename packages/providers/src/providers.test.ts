import { describe, expect, it } from "vitest";
import { toChatMessages } from "./openai-compat.js";
import { CONSERVATIVE_PRICE, costMicros, parsePrice } from "./pricing.js";

describe("pricing", () => {
  it("parses input/output prices", () => {
    expect(parsePrice("5/25")).toEqual({ input: 5, output: 25 });
    expect(parsePrice(" 0.8 / 4 ")).toEqual({ input: 0.8, output: 4 });
  });

  it("falls back to a conservative price", () => {
    expect(parsePrice(undefined)).toBe(CONSERVATIVE_PRICE);
    expect(parsePrice("cheap")).toBe(CONSERVATIVE_PRICE);
  });

  it("prices tokens in micro-dollars", () => {
    // 1,000 input at $5/M = $0.005, 200 output at $25/M = $0.005 -> $0.01 = 10,000 micros
    expect(costMicros({ input: 5, output: 25 }, 1000, 200)).toBe(10_000);
  });
});

describe("toChatMessages", () => {
  it("maps tool calls and results to Chat Completions shape", () => {
    const out = toChatMessages({
      system: { stable: "base", dynamic: "ctx" },
      messages: [
        { role: "user", content: "hours?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "c1", name: "web_search", input: { query: "hours" } }],
        },
        { role: "tool", results: [{ toolCallId: "c1", name: "web_search", content: "9-5" }] },
      ],
    });
    expect(out).toEqual([
      { role: "system", content: "base\n\nctx" },
      { role: "user", content: "hours?" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "c1", type: "function", function: { name: "web_search", arguments: '{"query":"hours"}' } },
        ],
      },
      { role: "tool", tool_call_id: "c1", content: "9-5" },
    ]);
  });

  it("merges turns into strict alternation for Perplexity", () => {
    const out = toChatMessages(
      {
        system: { stable: "base" },
        messages: [
          { role: "assistant", content: "earlier reply" },
          { role: "user", content: "a" },
          { role: "user", content: "b" },
          { role: "assistant", content: "c" },
          { role: "user", content: "d" },
        ],
      },
      { alternate: true },
    );
    expect(out.map((m) => [m.role, m.content])).toEqual([
      ["system", "base"],
      ["user", "a\n\nb"],
      ["assistant", "c"],
      ["user", "d"],
    ]);
  });
});
