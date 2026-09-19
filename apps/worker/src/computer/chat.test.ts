import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import type { RelayBrowser } from "./browser.js";
import { chatSystem, runChatTurn } from "./chat.js";

const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } as Anthropic.Usage;
type Block = Anthropic.ContentBlock;
const call = (id: string, name: string, input: object, toolset?: string): Block =>
  ({ type: "tool_use", id, name, input, caller: { type: "direct" }, ...(toolset ? { toolset_name: toolset } : {}) }) as unknown as Block;

function scripted(...turns: Block[][]) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      create: vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        requests.push(structuredClone(params));
        const content = turns.shift() ?? [];
        return { content, stop_reason: "tool_use", usage, model: "claude-sonnet-5" };
      }),
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const hooks = () => ({ step: vi.fn(async () => {}), screen: vi.fn(async () => {}), stopped: vi.fn(async () => false), usage: vi.fn(async () => {}) });
const browser = () => ({ run: vi.fn(async () => [{ type: "text", text: "Done." }]), url: () => "https://chatgpt.com/c/abc" }) as unknown as RelayBrowser;
const base = { model: "claude-sonnet-5", provider: "gpt" as const, message: "what's 2+2?" };

describe("runChatTurn", () => {
  it("sends the message and returns the app's answer word for word", async () => {
    const { client, requests } = scripted(
      [call("a", "find", { query: "message composer" }, "browser"), call("b", "type", { text: "what's 2+2?" }, "browser")],
      [call("c", "answer", { text: "4" })],
    );
    const b = browser();
    const result = await runChatTurn({ ...base, client, browser: b, hooks: hooks() });
    expect(result).toEqual({ kind: "answer", text: "4" });
    expect(String(requests[0]!.messages[0]!.content)).toContain("what's 2+2?");
    expect(requests[0]!.system).toMatchObject([{ text: expect.stringContaining("person's own ChatGPT account") }]);
  });

  it("hands back a sign-in instead of trying to log in", async () => {
    const { client } = scripted([call("a", "sign_in", { reason: "ChatGPT is asking for the code it emailed" })]);
    expect(await runChatTurn({ ...base, client, browser: browser(), hooks: hooks() })).toEqual({
      kind: "sign_in",
      reason: "ChatGPT is asking for the code it emailed",
    });
  });

  it("reports long jobs instead of waiting them out", async () => {
    const { client } = scripted([call("a", "started", { note: "It's writing the app now." })]);
    const result = await runChatTurn({ ...base, client, browser: browser(), hooks: hooks() });
    expect(result).toEqual({ kind: "started", note: "It's writing the app now." });
  });

  it("uses the check-back instruction when given one", async () => {
    const { client, requests } = scripted([call("a", "answer", { text: "Here's the finished draft." })]);
    await runChatTurn({ ...base, client, browser: browser(), hooks: hooks(), instruction: "Look at where it got to." });
    expect(requests[0]!.messages[0]!.content).toBe("Look at where it got to.");
  });

  it("stops at the first failed browser action in a batch", async () => {
    const { client, requests } = scripted(
      [call("a", "left_click", { target: { type: "ref", ref: "ref_1" } }, "browser"), call("b", "type", { text: "hi" }, "browser")],
      [call("c", "problem", { message: "The composer wasn't there." })],
    );
    const b = browser();
    (b.run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("ref_1 isn't on the page anymore."));
    await runChatTurn({ ...base, client, browser: b, hooks: hooks() });
    const results = requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results[1]!.content).toBe("Not executed: an earlier action in this turn failed.");
  });
});

it("tells the model whose account it is and what not to do", () => {
  const system = chatSystem("claude");
  expect(system).toContain("Claude Pro or Max");
  expect(system).toMatch(/[Nn]ever type a password/);
  expect(system).toContain("Never answer from your own knowledge");
});
