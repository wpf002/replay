import { describe, expect, it } from "vitest";
import { generateInviteCode } from "./invites.js";

describe("generateInviteCode", () => {
  it("uses two blocks of unambiguous characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateInviteCode()).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    }
  });
});
