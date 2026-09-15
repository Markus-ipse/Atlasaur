import { describe, expect, it } from "vitest";
import { nextBackLine } from "./nextBack";

// Local-time constructors, so the calendar boundary is the learner's own.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 8, day, hour, minute);

describe("nextBackLine", () => {
  it("is null when nothing is scheduled", () => {
    expect(nextBackLine(null, at(13, 12))).toBeNull();
  });

  it("says later today for a return on the same local day", () => {
    expect(nextBackLine(at(13, 15), at(13, 12))).toBe(
      "More come back later today",
    );
  });

  it("says a few minutes when the next one is under an hour away", () => {
    expect(nextBackLine(at(13, 12, 10), at(13, 12))).toBe(
      "More come back in a few minutes",
    );
  });

  it("says a few minutes for one already back that the count has not caught", () => {
    expect(nextBackLine(at(13, 11, 50), at(13, 12))).toBe(
      "More come back in a few minutes",
    );
  });

  it("says tomorrow across midnight, however few hours away", () => {
    expect(nextBackLine(at(14, 1, 30), at(13, 23, 30))).toBe(
      "The next ones come back tomorrow",
    );
  });

  it("counts calendar days beyond tomorrow", () => {
    expect(nextBackLine(at(17, 9), at(13, 22))).toBe(
      "The next ones come back in 4 days",
    );
  });
});
