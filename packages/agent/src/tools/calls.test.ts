import { describe, expect, it } from "vitest";
import { checkCallTarget, placeCall } from "./calls.js";
import type { ToolContext } from "./types.js";

const ctx = { phone: "+15125550100", timezone: "America/Chicago" } as ToolContext;
const brief = {
  businessName: "Luigi's",
  phoneNumber: "(512) 555-0123",
  goal: "Book a table for 2 this Friday at 7 PM",
};

describe("place_call", () => {
  it("accepts US business numbers", () => {
    expect(placeCall.input.safeParse(brief).success).toBe(true);
  });

  it.each(["+44 20 7946 0958", "+1 900 555 0100", "911", "not a number"])("rejects %s", (phoneNumber) => {
    expect(placeCall.input.safeParse({ ...brief, phoneNumber }).success).toBe(false);
  });

  it("shows exactly what the call will do, including whether the number is shared", async () => {
    const input = placeCall.input.parse({ ...brief, flexibility: "6:30 to 8 PM" });
    expect(await placeCall.describe(input, ctx)).toBe(
      "Call Luigi's at (512) 555-0123 to: Book a table for 2 this Friday at 7 PM\nOK to accept: 6:30 to 8 PM\nShares your number (512) 555-0100 with them",
    );
    const privateInput = placeCall.input.parse({ ...brief, shareCallbackNumber: false });
    expect(await placeCall.describe(privateInput, ctx)).toContain("Doesn't share your number");
  });

  it("is always high risk", () => {
    expect(placeCall.kind).toBe("external");
    expect(placeCall.risk?.(placeCall.input.parse(brief))).toBe("HIGH");
  });

  it("won't call the user's own number", () => {
    expect(() => checkCallTarget("512-555-0100", "+15125550100")).toThrow(/your own number/);
  });
});
