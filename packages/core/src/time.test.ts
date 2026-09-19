import { describe, expect, it } from "vitest";
import { formatRange, startOfDay, utcOffset } from "./time.js";

describe("time helpers", () => {
  it("finds local midnight in the user's zone", () => {
    // 2026-09-19 03:30 UTC is still Sept 18 in Chicago (UTC-5).
    const now = new Date("2026-09-19T03:30:00Z");
    expect(startOfDay("America/Chicago", now).toISOString()).toBe("2026-09-18T05:00:00.000Z");
    expect(startOfDay("UTC", now).toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });

  it("reports the zone's UTC offset", () => {
    expect(utcOffset(new Date("2026-01-15T12:00:00Z"), "America/New_York")).toBe("-05:00");
    expect(utcOffset(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe("-04:00");
  });

  it("formats same-day ranges compactly", () => {
    const start = new Date("2026-09-22T20:00:00Z");
    const end = new Date("2026-09-22T21:00:00Z");
    expect(formatRange(start, end, "America/Chicago")).toBe("Tue, Sep 22, 3:00 PM – 4:00 PM");
  });
});
