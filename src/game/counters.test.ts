// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  emptyCounters,
  knownGain,
  loadCounters,
  recordAnswer,
  recordKnown,
  recordRoundFinished,
  recordRoundStarted,
  recordSessionEnded,
  returnInfo,
  saveCounters,
  startSession,
  type Counters,
} from "./counters";
import { MAX_DAYS, type StreakStore } from "./streak";

const DAY1 = new Date("2026-05-16T12:00:00");
const DAY2 = new Date("2026-05-17T12:00:00");
const DAY9 = new Date("2026-05-24T12:00:00");

describe("recordAnswer", () => {
  it("counts the answer against its question mode", () => {
    const c = recordAnswer(recordAnswer(emptyCounters(), "name-to-click"), "shape-to-name");
    expect(c.answersByQuestionMode).toEqual({
      "name-to-click": 1,
      "shape-to-name": 1,
    });
  });

  it("counts toward the first session until one has ended", () => {
    let c = recordAnswer(emptyCounters(), "name-to-click");
    c = recordAnswer(c, "name-to-click");
    expect(c.firstSessionAnswers).toBe(2);
  });

  it("freezes the first-session figure once a session has ended", () => {
    let c = recordAnswer(emptyCounters(), "name-to-click");
    c = recordSessionEnded(c);
    c = recordAnswer(c, "name-to-click");
    c = recordAnswer(c, "name-to-click");
    expect(c.firstSessionAnswers).toBe(1);
    // ...while the mode mix keeps counting for the life of the profile.
    expect(c.answersByQuestionMode["name-to-click"]).toBe(3);
  });
});

describe("startSession", () => {
  it("counts the load", () => {
    expect(startSession(emptyCounters(), false).sessionsStarted).toBe(1);
    const second = startSession(startSession(emptyCounters(), false), false);
    expect(second.sessionsStarted).toBe(2);
  });

  it("leaves a genuinely first session open", () => {
    const first = startSession(emptyCounters(), false);
    expect(first.firstSessionEnded).toBe(false);
  });

  it("freezes the first session on a second load", () => {
    // Closing the tab ends a session too — the commonest ending for exactly
    // the bouncing learner this figure is meant to measure.
    let c = startSession(emptyCounters(), false);
    c = recordAnswer(recordAnswer(c, "name-to-click"), "name-to-click");
    const nextVisit = startSession(c, false);
    expect(nextVisit.firstSessionEnded).toBe(true);
    expect(nextVisit.firstSessionAnswers).toBe(2);
    expect(recordAnswer(nextVisit, "name-to-click").firstSessionAnswers).toBe(2);
  });

  it("preserves a first session that answered nothing at all", () => {
    // The zero-card bounce is the most important reading this metric has, and
    // it leaves no other trace: no answers, no SRS records, no streak day.
    const bounced = startSession(emptyCounters(), false);
    const nextVisit = startSession(bounced, false);
    expect(nextVisit.firstSessionEnded).toBe(true);
    expect(nextVisit.firstSessionAnswers).toBe(0);
    // ...and the second visit's answers do not get the first one's label.
    expect(recordAnswer(nextVisit, "name-to-click").firstSessionAnswers).toBe(0);
  });

  it("freezes at zero for a profile that predates the counters key", () => {
    // Its real first session was never measured, so the Data view omits the
    // row rather than labelling a later session as the first.
    const next = startSession(emptyCounters(), true);
    expect(next.firstSessionEnded).toBe(true);
    expect(next.firstSessionAnswers).toBe(0);
  });

  it("does not reopen a session already frozen", () => {
    const frozen = recordSessionEnded(recordAnswer(emptyCounters(), "name-to-click"));
    const next = startSession(frozen, true);
    expect(next.firstSessionEnded).toBe(true);
    expect(next.firstSessionAnswers).toBe(1);
  });
});

describe("recordSessionEnded", () => {
  it("is idempotent, so a second session cannot reopen the first", () => {
    const once = recordSessionEnded(emptyCounters());
    expect(recordSessionEnded(once)).toBe(once);
  });
});

describe("rounds", () => {
  it("counts starts and finishes separately, and by round type", () => {
    let c = recordRoundStarted(emptyCounters(), "study");
    c = recordRoundFinished(c);
    c = recordRoundStarted(c, "study");
    c = recordRoundStarted(c, "quiz");
    c = recordRoundStarted(c, "expedition");
    expect(c.roundsStarted).toBe(4);
    expect(c.roundsFinished).toBe(1);
    expect(c.roundsByPractice).toEqual({ study: 2, quiz: 1, expedition: 1 });
  });
});

describe("recordKnown", () => {
  it("records nothing while nothing has been learned", () => {
    const c = emptyCounters();
    expect(recordKnown(c, 0, DAY1)).toBe(c);
  });

  it("snapshots the count on the day it changes", () => {
    const c = recordKnown(emptyCounters(), 3, DAY1);
    expect(c.knownByDay).toEqual([{ day: "2026-05-16", known: 3 }]);
  });

  it("says nothing on a day the count did not move", () => {
    const c = recordKnown(emptyCounters(), 3, DAY1);
    expect(recordKnown(c, 3, DAY2)).toBe(c);
  });

  it("overwrites the day's entry rather than appending within a day", () => {
    let c = recordKnown(emptyCounters(), 3, DAY1);
    c = recordKnown(c, 5, DAY1);
    expect(c.knownByDay).toEqual([{ day: "2026-05-16", known: 5 }]);
  });

  it("keeps one entry per day the count moved", () => {
    let c = recordKnown(emptyCounters(), 3, DAY1);
    c = recordKnown(c, 7, DAY2);
    expect(c.knownByDay).toEqual([
      { day: "2026-05-16", known: 3 },
      { day: "2026-05-17", known: 7 },
    ]);
  });
});

describe("knownGain", () => {
  it("reports nothing without a snapshot old enough to compare against", () => {
    const c = recordKnown(emptyCounters(), 3, DAY1);
    expect(knownGain(c, 7, DAY1)).toBeNull();
  });

  it("counts countries learned since the start of the window", () => {
    let c = recordKnown(emptyCounters(), 3, DAY1);
    c = recordKnown(c, 11, DAY9);
    // DAY9 is eight days after DAY1, so DAY1 is outside a seven-day window
    // and is the baseline.
    expect(knownGain(c, 7, DAY9)).toBe(8);
  });

  it("reports zero rather than null when nothing was learned in the window", () => {
    let c = recordKnown(emptyCounters(), 3, DAY1);
    c = recordKnown(c, 3, DAY9); // no-op: the count did not move
    expect(knownGain(c, 7, DAY9)).toBe(0);
  });

  it("reports nothing at all for an untouched profile", () => {
    expect(knownGain(emptyCounters(), 7, DAY1)).toBeNull();
  });
});

describe("returnInfo", () => {
  function streak(days: string[]): StreakStore {
    return { version: 1, days };
  }

  it("reports no gap with fewer than two days played", () => {
    expect(returnInfo(streak([]))).toEqual({
      daysPlayed: 0,
      longestGap: null,
      capped: false,
    });
    expect(returnInfo(streak(["2026-05-16"]))).toEqual({
      daysPlayed: 1,
      longestGap: null,
      capped: false,
    });
  });

  it("reports a zero gap for consecutive days", () => {
    expect(returnInfo(streak(["2026-05-16", "2026-05-17"]))).toEqual({
      daysPlayed: 2,
      longestGap: 0,
      capped: false,
    });
  });

  it("reports the longest run of missed days between two played ones", () => {
    // Played the 16th, 17th, then again on the 24th: six missed days.
    const info = returnInfo(
      streak(["2026-05-16", "2026-05-17", "2026-05-24", "2026-05-25"]),
    );
    expect(info).toEqual({ daysPlayed: 4, longestGap: 6, capped: false });
  });

  it("does not depend on the stored order", () => {
    expect(returnInfo(streak(["2026-05-24", "2026-05-16"])).longestGap).toBe(7);
  });

  it("flags a history the streak store has started trimming", () => {
    // At the cap the oldest days are gone, so the count is a floor and the
    // longest gap may have lost an endpoint. The Data view says so instead of
    // reporting either one as if it were the lifetime figure.
    const many = Array.from({ length: MAX_DAYS }, (_, i) => {
      const d = new Date(Date.UTC(2020, 0, 1 + i));
      return d.toISOString().slice(0, 10);
    });
    expect(returnInfo(streak(many)).capped).toBe(true);
    expect(returnInfo(streak(many.slice(1))).capped).toBe(false);
  });
});

describe("loadCounters / saveCounters", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("returns an empty store when nothing is saved", () => {
    expect(loadCounters()).toEqual(emptyCounters());
  });

  it("round-trips a populated store", () => {
    let c = recordAnswer(emptyCounters(), "shape-to-name");
    c = recordRoundStarted(c, "quiz");
    c = recordKnown(c, 4, DAY1);
    saveCounters(c);
    expect(loadCounters()).toEqual(c);
  });

  it("resets on malformed JSON rather than throwing", () => {
    window.localStorage.setItem("atlasaur:counters:v1", "{ not json");
    expect(loadCounters()).toEqual(emptyCounters());
  });

  it("resets on a store from a different version", () => {
    window.localStorage.setItem(
      "atlasaur:counters:v1",
      JSON.stringify({ version: 2, roundsStarted: 9 }),
    );
    expect(loadCounters()).toEqual(emptyCounters());
  });

  it("drops knownByDay entries whose day is not a date", () => {
    window.localStorage.setItem(
      "atlasaur:counters:v1",
      JSON.stringify({
        version: 1,
        knownByDay: [
          { day: "2026-05-16", known: 3 },
          { day: "junk", known: 9 },
          { day: "", known: 9 },
          { day: "9999-99-99", known: 9 },
          { day: "2026-5-1", known: 9 },
        ],
      }),
    );
    // "9999-99-99" matches the shape but is not a real date; it is kept and
    // sorts last, which is harmless. Everything not of the shape is dropped,
    // so knownGain can never meet a NaN day and silently give up.
    expect(loadCounters().knownByDay).toEqual([
      { day: "2026-05-16", known: 3 },
      { day: "9999-99-99", known: 9 },
    ]);
  });

  it("orders and de-duplicates knownByDay, keeping each day's last value", () => {
    window.localStorage.setItem(
      "atlasaur:counters:v1",
      JSON.stringify({
        version: 1,
        knownByDay: [
          { day: "2026-05-20", known: 8 },
          { day: "2026-05-16", known: 3 },
          { day: "2026-05-20", known: 9 },
        ],
      }),
    );
    expect(loadCounters().knownByDay).toEqual([
      { day: "2026-05-16", known: 3 },
      { day: "2026-05-20", known: 9 },
    ]);
  });

  it("repairs missing and nonsense fields instead of trusting them", () => {
    window.localStorage.setItem(
      "atlasaur:counters:v1",
      JSON.stringify({
        version: 1,
        roundsStarted: -4,
        roundsFinished: "seven",
        firstSessionAnswers: Number.NaN,
        answersByQuestionMode: null,
        knownByDay: [{ day: "2026-05-16", known: 3 }, "junk", { known: 2 }],
      }),
    );
    const loaded = loadCounters();
    expect(loaded.roundsStarted).toBe(0);
    expect(loaded.roundsFinished).toBe(0);
    expect(loaded.firstSessionAnswers).toBe(0);
    expect(loaded.answersByQuestionMode).toEqual({
      "name-to-click": 0,
      "shape-to-name": 0,
    });
    expect(loaded.knownByDay).toEqual([{ day: "2026-05-16", known: 3 }]);
  });
});

describe("what the counters do not do", () => {
  it("keeps no per-country and no per-answer detail", () => {
    // The whole store is a handful of integers plus one figure per day. If a
    // future field would identify a country or a moment, it does not belong
    // here — this is a local metric, not a log.
    let c: Counters = emptyCounters();
    c = recordAnswer(c, "name-to-click");
    c = recordKnown(c, 1, DAY1);
    // Assert the whole shape rather than grepping the serialised form: a new
    // field carrying a country or a moment fails here, whatever it is named.
    expect(Object.keys(c).sort()).toEqual([
      "answersByQuestionMode",
      "firstSessionAnswers",
      "firstSessionEnded",
      "knownByDay",
      "roundsByPractice",
      "roundsFinished",
      "roundsStarted",
      "sessionsStarted",
      "version",
    ]);
    expect(Object.keys(c.answersByQuestionMode).sort()).toEqual([
      "name-to-click",
      "shape-to-name",
    ]);
    expect(Object.keys(c.knownByDay[0]).sort()).toEqual(["day", "known"]);
    // Day keys only, never a time of day.
    expect(c.knownByDay.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.day))).toBe(true);
  });
});
