import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { BrowserActionError, type RelayBrowser } from "./browser.js";
import { describeAction, pruneScreenshots, runComputerLoop, type LoopHooks } from "./loop.js";

type Block = Anthropic.ContentBlock;
const usage = { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } as Anthropic.Usage;
const browserCall = (id: string, name: string, input: object): Block =>
  ({ type: "tool_use", id, name, input, toolset_name: "browser", caller: { type: "direct" } }) as unknown as Block;
const call = (id: string, name: string, input: object): Block =>
  ({ type: "tool_use", id, name, input, caller: { type: "direct" } }) as unknown as Block;

function scripted(...turns: Block[][]) {
  const requests: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      create: vi.fn(async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        requests.push(structuredClone(params));
        const content = turns.shift();
        if (!content) throw new Error("model called more times than scripted");
        return { content, stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn", usage, model: "claude-sonnet-5" };
      }),
    },
  } as unknown as Anthropic;
  return { client, requests };
}

function hooks(overrides: Partial<LoopHooks> = {}): LoopHooks {
  return {
    step: vi.fn(async () => {}),
    screen: vi.fn(async () => {}),
    approve: vi.fn(async () => "approved" as const),
    ask: vi.fn(async () => "the 9:40 one"),
    handOff: vi.fn(async () => "done" as const),
    stopped: vi.fn(async () => false),
    usage: vi.fn(async () => {}),
    ...overrides,
  };
}

function fakeBrowser(run: (name: string, input: Record<string, unknown>) => Promise<unknown> = async () => [{ type: "text", text: "Done." }]) {
  return { run: vi.fn(run), url: () => "https://www.instacart.com/store/checkout" } as unknown as RelayBrowser & { run: ReturnType<typeof vi.fn> };
}

const base = { model: "claude-sonnet-5", system: "s", context: "c", goal: "Order oat milk" };

describe("runComputerLoop", () => {
  it("runs browser actions, asks for approval, and finishes with the summary", async () => {
    const { client, requests } = scripted(
      [browserCall("a", "navigate", { url: "https://instacart.com" }), browserCall("b", "left_click", { target: { type: "ref", ref: "ref_3" } })],
      [call("c", "request_approval", { summary: "Place order: oat milk x2, $9.48 total, Visa ending 4242", amount_usd: 9.48 })],
      [call("d", "finish", { outcome: "done", summary: "Ordered. Arrives today 5 to 6 PM." })],
    );
    const h = hooks();
    const browser = fakeBrowser();
    const result = await runComputerLoop({ ...base, client, browser, hooks: h });

    expect(result).toEqual({ outcome: "done", summary: "Ordered. Arrives today 5 to 6 PM." });
    expect(browser.run).toHaveBeenCalledTimes(2);
    expect(h.approve).toHaveBeenCalledWith("Place order: oat milk x2, $9.48 total, Visa ending 4242", 9.48);
    expect(h.step).toHaveBeenCalledWith("action", "Opened instacart.com");
    // Browser results echo the toolset; approval results tell the model to go ahead.
    const second = requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(second.every((r) => r.toolset_name === "browser")).toBe(true);
    const third = requests[2]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(third[0]!.content).toMatch(/^Approved/);
  });

  it("stops a batch at the first failed browser action", async () => {
    const { client, requests } = scripted(
      [browserCall("a", "left_click", { target: { type: "ref", ref: "ref_9" } }), browserCall("b", "type", { text: "x" })],
      [call("c", "finish", { outcome: "failed", summary: "Couldn't find it." })],
    );
    const browser = fakeBrowser(async (name) => {
      if (name === "left_click") throw new BrowserActionError("ref_9 isn't on the page anymore.");
      return [{ type: "text", text: "Done." }];
    });
    await runComputerLoop({ ...base, client, browser, hooks: hooks() });
    const results = requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results).toMatchObject([
      { is_error: true, content: "Error: ref_9 isn't on the page anymore." },
      { is_error: true, content: "Not executed: an earlier action in this turn failed." },
    ]);
    expect(browser.run).toHaveBeenCalledTimes(1);
  });

  it("tells the model when the person says no", async () => {
    const { client, requests } = scripted(
      [call("a", "request_approval", { summary: "Book the 7:05 AM flight, $412" })],
      [call("b", "finish", { outcome: "blocked", summary: "Didn't book it." })],
    );
    await runComputerLoop({ ...base, client, browser: fakeBrowser(), hooks: hooks({ approve: vi.fn(async () => "denied" as const) }) });
    const results = requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
    expect(results[0]!.content).toMatch(/They said no/);
  });

  it("passes answers back and stops when the task is canceled", async () => {
    const { client, requests } = scripted(
      [call("a", "ask_user", { question: "7:05 AM for $412 or 9:40 AM for $389?" })],
      [browserCall("b", "screenshot", {})],
    );
    const stopped = vi.fn(async () => false).mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await runComputerLoop({ ...base, client, browser: fakeBrowser(), hooks: hooks({ stopped }) });
    expect((requests[1]!.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[])[0]!.content).toBe("Their answer: the 9:40 one");
    expect(result.outcome).toBe("stopped");
  });
});

it("describes navigations and typing for the activity log", () => {
  expect(describeAction("navigate", { url: "https://www.opentable.com/r/x" })).toBe("Opened opentable.com");
  expect(describeAction("navigate", { url: "back" })).toBeNull();
  expect(describeAction("left_click", {})).toBeNull();
  expect(describeAction("type", { text: "oat milk" })).toBe('Typed "oat milk"');
});

it("drops old screenshots once they pile up", () => {
  const shot = (id: string): Anthropic.ToolResultBlockParam => ({
    type: "tool_result",
    tool_use_id: id,
    content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "x" } }],
  });
  const messages: Anthropic.MessageParam[] = Array.from({ length: 11 }, (_, i) => ({ role: "user" as const, content: [shot(`t${i}`)] }));
  pruneScreenshots(messages);
  const images = messages.flatMap((m) => (m.content as Anthropic.ToolResultBlockParam[])[0]!.content as { type: string }[]);
  expect(images.filter((c) => c.type === "image")).toHaveLength(3);
});
