// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dayKey,
  emptyStreak,
  loadStreak,
  recordDay,
  saveStreak,
  streakInfo,
  type StreakStore,
} from "./streak";

// Local noon so dayKey is stable regardless of the test runner's zone.
function at(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
function store(...days: string[]): StreakStore {
  return { version: 1, days: [...days].sort() };
}

describe("dayKey / recordDay", () => {
  it("uses the local calendar date", () => {
    expect(dayKey(at("2026-09-05"))).toBe("2026-09-05");
    expect(dayKey(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
    expect(dayKey(new Date(2026, 11, 31, 23, 55))).toBe("2026-12-31");
  });

  it("records a day once and returns the same store when already recorded", () => {
    const s0 = emptyStreak();
    const s1 = recordDay(s0, at("2026-09-05"));
    expect(s1.days).toEqual(["2026-09-05"]);
    expect(recordDay(s1, at("2026-09-05"))).toBe(s1);
    const s2 = recordDay(s1, at("2026-09-03"));
    expect(s2.days).toEqual(["2026-09-03", "2026-09-05"]);
  });
});

describe("streakInfo", () => {
  it("is day 1 with nothing recorded", () => {
    expect(streakInfo(emptyStreak(), at("2026-09-05"))).toEqual({
      length: 0,
      todayPlayed: false,
      day: 1,
    });
  });

  it("counts consecutive days ending today", () => {
    const s = store("2026-09-03", "2026-09-04", "2026-09-05");
    expect(streakInfo(s, at("2026-09-05"))).toEqual({
      length: 3,
      todayPlayed: true,
      day: 3,
    });
  });

  it("does not hold an unplayed today against the learner", () => {
    const s = store("2026-09-03", "2026-09-04");
    expect(streakInfo(s, at("2026-09-05"))).toEqual({
      length: 2,
      todayPlayed: false,
      day: 3,
    });
  });

  it("bridges one missed day", () => {
    // Missed the 4th.
    const s = store("2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05");
    expect(streakInfo(s, at("2026-09-05")).length).toBe(4);
    // Missed yesterday, today not yet played: streak still alive.
    const t = store("2026-09-02", "2026-09-03");
    expect(streakInfo(t, at("2026-09-05"))).toEqual({
      length: 2,
      todayPlayed: false,
      day: 3,
    });
  });

  it("breaks on a second missed day within a week", () => {
    // Missed the 2nd and the 4th.
    const s = store("2026-09-01", "2026-09-03", "2026-09-05");
    expect(streakInfo(s, at("2026-09-05")).length).toBe(2);
    // Two missed days in a row always break.
    const t = store("2026-09-01", "2026-09-02", "2026-09-05");
    expect(streakInfo(t, at("2026-09-05")).length).toBe(1);
  });

  it("allows another bridge once a week has passed", () => {
    const days: string[] = [];
    for (let d = 1; d <= 20; d++) {
      if (d === 5 || d === 13) continue; // two gaps, eight days apart
      days.push(`2026-09-${String(d).padStart(2, "0")}`);
    }
    expect(streakInfo(store(...days), at("2026-09-20")).length).toBe(18);
  });

  it("a long absence starts over at day 1", () => {
    const s = store("2026-08-01", "2026-08-02", "2026-08-03");
    expect(streakInfo(s, at("2026-09-05"))).toEqual({
      length: 0,
      todayPlayed: false,
      day: 1,
    });
  });

  it("walks across a month boundary", () => {
    const s = store("2026-08-30", "2026-08-31", "2026-09-01");
    expect(streakInfo(s, at("2026-09-01")).length).toBe(3);
  });
});

describe("loadStreak / saveStreak", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("round-trips", () => {
    const s = store("2026-09-04", "2026-09-05");
    saveStreak(s);
    expect(loadStreak()).toEqual(s);
  });

  it("returns an empty store when nothing is persisted or on garbage", () => {
    expect(loadStreak()).toEqual(emptyStreak());
    window.localStorage.setItem("atlasaur:streak:v1", "nope");
    expect(loadStreak()).toEqual(emptyStreak());
    window.localStorage.setItem("atlasaur:streak:v1", JSON.stringify({ version: 2, days: [] }));
    expect(loadStreak()).toEqual(emptyStreak());
  });

  it("drops malformed entries and duplicates", () => {
    window.localStorage.setItem(
      "atlasaur:streak:v1",
      JSON.stringify({ version: 1, days: ["2026-09-05", 7, "bad", "2026-09-05", "2026-09-04"] }),
    );
    expect(loadStreak().days).toEqual(["2026-09-04", "2026-09-05"]);
  });
});
