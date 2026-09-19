import { describe, expect, it } from "vitest";
import { confirmationPrompt, parseConfirmation } from "./confirm.js";

describe("parseConfirmation", () => {
  it.each(["YES", "yes", "Yes!", "y", "ok", "Okay.", "send it", "go ahead", "yes please", "Sure"])(
    "accepts %s",
    (body) => {
      expect(parseConfirmation(body)).toEqual({ kind: "yes" });
    },
  );

  it.each([
    ["YES 1234", "1234"],
    ["yes, 4821", "4821"],
    ["yes #998877", "998877"],
    ["1234", "1234"],
  ])("reads the PIN from %s", (body, pin) => {
    expect(parseConfirmation(body)).toEqual({ kind: "yes", pin });
  });

  it.each(["NO", "no thanks", "nope", "skip", "don't", "never mind"])("declines on %s", (body) => {
    expect(parseConfirmation(body)).toEqual({ kind: "no" });
  });

  it.each([
    "yes but change the subject to Friday",
    "yesterday was great",
    "no idea, what do you think",
    "ok so what about tomorrow",
    "123",
  ])("treats %s as a new message", (body) => {
    expect(parseConfirmation(body)).toBeNull();
  });
});

describe("confirmationPrompt", () => {
  it("asks for YES on a single action", () => {
    expect(confirmationPrompt([{ summary: "Send email to sam@example.com", requiresPin: false }])).toBe(
      "Send email to sam@example.com\n\nReply YES to go ahead, or NO to skip.",
    );
  });

  it("numbers several actions and asks for the PIN when any needs it", () => {
    const text = confirmationPrompt([
      { summary: "Send email to a@example.com", requiresPin: false },
      { summary: "Call Luigi's at (512) 555-0100", requiresPin: true },
    ]);
    expect(text).toContain("1) Send email to a@example.com");
    expect(text).toContain("2) Call Luigi's");
    expect(text).toContain("Reply YES followed by your PIN to do all 2");
  });
});
