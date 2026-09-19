import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./reminders.js";
import { addLocalDays } from "./time.js";

const TZ = "America/Chicago";

describe("addLocalDays", () => {
  it("keeps the local time across the fall DST change", () => {
    // Sat Oct 31 2026 8:00 AM CDT (UTC-5) -> Sun Nov 1 is still CDT until 2 AM, then CST.
    const sat = new Date("2026-10-31T13:00:00Z");
    const mon = addLocalDays(sat, 2, TZ); // Mon Nov 2, 8:00 AM CST (UTC-6)
    expect(mon.toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });
});

describe("nextOccurrence", () => {
  const friday9am = new Date("2026-09-18T14:00:00Z"); // Fri Sep 18, 9:00 AM CDT

  it("repeats daily", () => {
    expect(nextOccurrence(friday9am, "daily", TZ, friday9am).toISOString()).toBe("2026-09-19T14:00:00.000Z");
  });

  it("skips weekends for weekdays", () => {
    expect(nextOccurrence(friday9am, "weekdays", TZ, friday9am).toISOString()).toBe("2026-09-21T14:00:00.000Z");
  });

  it("repeats weekly", () => {
    expect(nextOccurrence(friday9am, "weekly", TZ, friday9am).toISOString()).toBe("2026-09-25T14:00:00.000Z");
  });

  it("catches up past missed occurrences instead of firing them all", () => {
    const later = new Date("2026-09-23T20:00:00Z"); // Wed afternoon
    expect(nextOccurrence(friday9am, "daily", TZ, later).toISOString()).toBe("2026-09-24T14:00:00.000Z");
  });
});
