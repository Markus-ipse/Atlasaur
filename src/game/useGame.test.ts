import { describe, it, expect } from "vitest";
import {
  answerFact,
  cardIsFiller,
  cardIsReturning,
  newCapReached,
  nothingUseful,
  filterPool,
  initialState,
  learnerFact,
  reducer,
  ROUND_SIZE,
  type State,
} from "./useGame";
import { STUDY_NEW_CAP } from "./pickCountry";
import { emptyStore, grade as srsGrade, introductionOrder } from "./srs";
import { storeWith } from "./srsFixtures";
import { crossesIntoKnown } from "./milestones";
import { testTally } from "./testTally";
import {
  EXPEDITION_SIZE,
  expeditionPool,
  newExpedition,
  type ExpeditionStore,
} from "./expedition";
import countriesData from "../data/countries.json";
import { ALL_CONTINENTS, type Country, type SrsRecord } from "../types";

const ALL_COUNTRIES = countriesData as Country[];

function withCurrent(state: State, iso3: string): State {
  // Force a known current country by pulling it from any state's seed pool
  // via reducer-internal lookup is overkill; we just rebuild the country
  // with the same iso3 and trust the reducer keys off iso3.
  const country: Country = {
    numeric: "000",
    iso3,
    name: iso3,
    aliases: [],
    continent: "Europe",
    subregion: "Western Europe",
    capital: "—",
    capitalLonLat: [0, 0],
    neighbors: [],
    sizeTier: 0,
    notabilityTier: 0,
  };
  return { ...state, current: country };
}

describe("reducer — normal phase", () => {
  it("answer-correct: increments score, streak, total; sets correct feedback", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA" });
    expect(s1.score).toBe(1);
    expect(s1.streak).toBe(1);
    expect(s1.total).toBe(1);
    expect(s1.feedback).toEqual({
      kind: "correct",
      answerIso3: "FRA",
      correctIso3: "FRA",
      at: expect.any(Number),
    });
    expect(s1.retryQueue).toEqual([]);
    expect(s1.missed).toEqual([]);
  });

  it("answer-wrong: resets streak, appends missed, queues retry with future dueAt", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(
      { ...s0, streak: 3 },
      { type: "answer", iso3: "DEU" },
    );
    expect(s1.score).toBe(0);
    expect(s1.streak).toBe(0);
    expect(s1.total).toBe(1);
    expect(s1.missed.map((c) => c.iso3)).toEqual(["FRA"]);
    expect(s1.missedSet.has("FRA")).toBe(true);
    expect(s1.retryQueue).toHaveLength(1);
    expect(s1.retryQueue[0].iso3).toBe("FRA");
    expect(s1.retryQueue[0].dueAt).toBeGreaterThanOrEqual(s1.total + 3);
    expect(s1.retryQueue[0].dueAt).toBeLessThanOrEqual(s1.total + 5);
    expect(s1.feedback).toEqual({
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
      at: expect.any(Number),
    });
  });

  it("feedback carries the answer action's now as its time", () => {
    const now = new Date("2026-09-30T23:59:59");
    const s0 = withCurrent(initialState(), "FRA");
    expect(reducer(s0, { type: "answer", iso3: "FRA", now }).feedback?.at).toBe(
      now.getTime(),
    );
    expect(reducer(s0, { type: "skip", now }).feedback?.at).toBe(now.getTime());
  });

  it("skip: same as wrong but with kind=skipped and empty answerIso3", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "skip" });
    expect(s1.streak).toBe(0);
    expect(s1.total).toBe(1);
    expect(s1.missed.map((c) => c.iso3)).toEqual(["FRA"]);
    expect(s1.retryQueue).toHaveLength(1);
    expect(s1.feedback).toEqual({
      kind: "skipped",
      answerIso3: "",
      correctIso3: "FRA",
      at: expect.any(Number),
    });
  });

  it("missing the same country twice does not double-list it in missed[]", () => {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "skip" });
    s = reducer(s, { type: "dismiss" });
    s = withCurrent(s, "FRA");
    s = reducer(s, { type: "skip" });
    expect(s.missed.map((c) => c.iso3)).toEqual(["FRA"]);
  });

  it("answering a queued country correctly removes it from the queue", () => {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "skip" });
    expect(s.retryQueue.map((e) => e.iso3)).toEqual(["FRA"]);
    s = reducer(s, { type: "dismiss" });
    s = withCurrent(s, "FRA");
    s = reducer(s, { type: "answer", iso3: "FRA" });
    expect(s.retryQueue).toEqual([]);
    expect(s.score).toBe(1);
  });

  it("dismiss after feedback clears it and picks a new current", () => {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "answer", iso3: "FRA" });
    expect(s.feedback).not.toBeNull();
    s = reducer(s, { type: "dismiss" });
    expect(s.feedback).toBeNull();
    expect(s.current).toBeDefined();
  });

  it("dismiss with no feedback is a no-op", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "dismiss" });
    expect(s1).toBe(s0);
  });

  it("answer or skip while feedback is showing is a no-op", () => {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "answer", iso3: "FRA" });
    expect(reducer(s, { type: "answer", iso3: "DEU" })).toBe(s);
    expect(reducer(s, { type: "skip" })).toBe(s);
  });
});

describe("reducer — review phase", () => {
  function seedReview(): State {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "skip" });
    s = reducer(s, { type: "dismiss" });
    s = withCurrent(s, "DEU");
    s = reducer(s, { type: "skip" });
    s = reducer(s, { type: "dismiss" });
    s = reducer(s, { type: "endSession" });
    s = reducer(s, { type: "startReview" });
    return s;
  }

  it("startReview switches phase, clears sessionDone, sets current to first queue entry", () => {
    const s = seedReview();
    expect(s.phase).toBe("review");
    expect(s.sessionDone).toBe(false);
    expect(s.feedback).toBeNull();
    expect(["FRA", "DEU"]).toContain(s.current.iso3);
  });

  it("review: correct answer is unscored — score/total/missed unchanged", () => {
    // `streak` is deliberately not in this list since R2.2: it drives the
    // ceremony copy rather than the session summary, so it counts every
    // answer in both phases. The session statistics still do not.
    const before = seedReview();
    const baseline = {
      score: before.score,
      streak: before.streak,
      total: before.total,
      missed: before.missed,
    };
    const after = reducer(before, {
      type: "answer",
      iso3: before.current.iso3,
    });
    expect(after.score).toBe(baseline.score);
    expect(after.streak).toBe(baseline.streak + 1);
    expect(after.total).toBe(baseline.total);
    expect(after.missed).toBe(baseline.missed);
    expect(after.retryQueue.some((e) => e.iso3 === before.current.iso3)).toBe(
      false,
    );
  });

  it("review: wrong answer pushes country to back of queue, ungraded", () => {
    const before = seedReview();
    const wrongIso3 =
      before.retryQueue.find((e) => e.iso3 !== before.current.iso3)?.iso3 ??
      before.current.iso3;
    const after = reducer(before, { type: "answer", iso3: wrongIso3 });
    expect(after.score).toBe(before.score);
    expect(after.total).toBe(before.total);
    expect(after.retryQueue).toHaveLength(before.retryQueue.length);
    expect(after.retryQueue[after.retryQueue.length - 1].iso3).toBe(
      before.current.iso3,
    );
  });

  it("review: dismiss after final correct answer flips back to normal + sessionDone", () => {
    let s = seedReview();
    while (s.retryQueue.length > 0) {
      s = reducer(s, { type: "answer", iso3: s.current.iso3 });
      s = reducer(s, { type: "dismiss" });
    }
    expect(s.phase).toBe("normal");
    expect(s.sessionDone).toBe(true);
    expect(s.retryQueue).toEqual([]);
  });
});

describe("reducer — lifecycle", () => {
  it("setMode resets state", () => {
    let s = withCurrent(initialState("name-to-click"), "FRA");
    s = reducer(s, { type: "skip" });
    s = reducer(s, { type: "setMode", mode: "shape-to-name" });
    expect(s.mode).toBe("shape-to-name");
    expect(s.score).toBe(0);
    expect(s.total).toBe(0);
    expect(s.missed).toEqual([]);
    expect(s.retryQueue).toEqual([]);
    expect(s.completedSet.size).toBe(0);
    expect(s.phase).toBe("normal");
  });

  it("setMode to same mode is a no-op", () => {
    const s0 = initialState("name-to-click");
    const s1 = reducer(s0, { type: "setMode", mode: "name-to-click" });
    expect(s1).toBe(s0);
  });

  it("endSession marks done and clears feedback", () => {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "answer", iso3: "FRA" });
    s = reducer(s, { type: "endSession" });
    expect(s.sessionDone).toBe(true);
    expect(s.feedback).toBeNull();
  });

  it("startReview is a no-op if retry queue is empty", () => {
    const s0 = reducer(initialState(), { type: "endSession" });
    const s1 = reducer(s0, { type: "startReview" });
    expect(s1).toBe(s0);
  });

  it("reset returns to initial state of the same mode", () => {
    let s = withCurrent(initialState("shape-to-name"), "FRA");
    s = reducer(s, { type: "skip" });
    s = reducer(s, { type: "reset" });
    expect(s.mode).toBe("shape-to-name");
    expect(s.score).toBe(0);
    expect(s.total).toBe(0);
    expect(s.retryQueue).toEqual([]);
    expect(s.completedSet.size).toBe(0);
  });

  it("setMode preserves selectedContinents", () => {
    let s = initialState("name-to-click", ["Europe"]);
    s = reducer(s, { type: "setMode", mode: "shape-to-name" });
    expect(s.selectedContinents).toEqual(["Europe"]);
  });

  it("reset preserves selectedContinents", () => {
    let s = initialState("name-to-click", ["Europe"]);
    s = reducer(s, { type: "reset" });
    expect(s.selectedContinents).toEqual(["Europe"]);
  });
});

describe("reducer — completion tracking", () => {
  it("correct answer adds the iso3 to completedSet (normal phase)", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA" });
    expect(s1.completedSet.has("FRA")).toBe(true);
  });

  it("wrong answer does NOT add the iso3 to completedSet", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "DEU" });
    expect(s1.completedSet.has("FRA")).toBe(false);
    expect(s1.completedSet.size).toBe(0);
    expect(s1.retryQueue.map((e) => e.iso3)).toEqual(["FRA"]);
  });

  it("dismiss auto-flips sessionDone when every in-scope country is completed", () => {
    // Scope to Antarctica only (small pool: ATA, ATF). Seed completedSet with both.
    const s0 = withCurrent(
      initialState({ mode: "name-to-click", selectedContinents: ["Antarctica"], includeTerritories: true }),
      "ATA",
    );
    const seeded: State = {
      ...s0,
      completedSet: new Set(["ATA", "ATF"]),
      retryQueue: [],
      feedback: { kind: "correct", answerIso3: "ATA", correctIso3: "ATA", at: 0 },
    };
    const result = reducer(seeded, { type: "dismiss" });
    expect(result.sessionDone).toBe(true);
    expect(result.feedback).toBeNull();
  });

  it("dismiss does not flip sessionDone while retryQueue is non-empty", () => {
    const s0 = withCurrent(
      initialState({ mode: "name-to-click", selectedContinents: ["Antarctica"], includeTerritories: true }),
      "ATA",
    );
    const seeded: State = {
      ...s0,
      completedSet: new Set(["ATA"]),
      retryQueue: [{ iso3: "ATF", dueAt: 1 }],
      feedback: { kind: "correct", answerIso3: "ATA", correctIso3: "ATA", at: 0 },
    };
    const result = reducer(seeded, { type: "dismiss" });
    expect(result.sessionDone).toBe(false);
  });

  it("setContinents preserves completedSet across continent changes", () => {
    // Out-of-scope entries are kept so widening later restores prior progress.
    // The displayed Done count is derived against the active scope at read time.
    const s: State = {
      ...initialState("name-to-click", ALL_CONTINENTS),
      completedSet: new Set(["FRA", "EGY", "DEU"]),
    };
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe"],
    });
    expect([...result.completedSet].sort()).toEqual(["DEU", "EGY", "FRA"]);
  });

  it("setContinents auto-flips sessionDone when narrowed scope is fully completed", () => {
    const s: State = {
      ...withCurrent(
        initialState({
          mode: "name-to-click",
          selectedContinents: ALL_CONTINENTS,
          includeTerritories: true,
        }),
        "ATA",
      ),
      completedSet: new Set(["ATA", "ATF"]),
      retryQueue: [],
    };
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Antarctica"],
    });
    expect(result.sessionDone).toBe(true);
  });
});

describe("reducer — setContinents", () => {
  it("empty array is a no-op", () => {
    const s0 = initialState("name-to-click", ["Europe"]);
    const s1 = reducer(s0, { type: "setContinents", continents: [] });
    expect(s1).toBe(s0);
  });

  it("preserves score, streak, total, missed when narrowing scope", () => {
    const egypt: Country = {
      numeric: "818",
      iso3: "EGY",
      name: "Egypt",
      aliases: [],
      continent: "Africa",
      subregion: "Northern Africa",
      capital: "Cairo",
      capitalLonLat: [31.25, 30.05],
      neighbors: ["LBY", "SDN", "ISR", "PSE"],
      sizeTier: 2,
      notabilityTier: 2,
    };
    const s: State = {
      ...initialState("name-to-click", ALL_CONTINENTS),
      score: 5,
      streak: 3,
      total: 7,
      missed: [egypt],
      missedSet: new Set(["EGY"]),
    };
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe"],
    });
    expect(result.score).toBe(5);
    expect(result.streak).toBe(3);
    expect(result.total).toBe(7);
    expect(result.missed.map((c) => c.iso3)).toEqual(["EGY"]);
    expect(result.missedSet.has("EGY")).toBe(true);
  });

  it("prunes retryQueue to in-scope iso3s", () => {
    const s: State = {
      ...initialState("name-to-click", ALL_CONTINENTS),
      retryQueue: [
        { iso3: "FRA", dueAt: 5 },
        { iso3: "EGY", dueAt: 6 },
        { iso3: "DEU", dueAt: 7 },
      ],
    };
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe"],
    });
    expect(result.retryQueue.map((e) => e.iso3)).toEqual(["FRA", "DEU"]);
  });

  it("re-picks current when current is now out of scope", () => {
    const s = withCurrent(
      initialState("name-to-click", ALL_CONTINENTS),
      "EGY",
    );
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe"],
    });
    expect(result.current.iso3).not.toBe("EGY");
    expect(result.current.continent).toBe("Europe");
  });

  it("keeps current when it is still in scope", () => {
    const s = withCurrent(
      initialState("name-to-click", ALL_CONTINENTS),
      "FRA",
    );
    const before = s.current;
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe", "Asia"],
    });
    expect(result.current).toBe(before);
  });

  it("clears feedback", () => {
    const s: State = {
      ...withCurrent(initialState("name-to-click", ALL_CONTINENTS), "FRA"),
      feedback: { kind: "wrong", answerIso3: "DEU", correctIso3: "FRA", at: 0 },
    };
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe"],
    });
    expect(result.feedback).toBeNull();
  });

  it("ends review session when retry queue becomes empty after pruning", () => {
    const s: State = {
      ...withCurrent(initialState("name-to-click", ALL_CONTINENTS), "EGY"),
      phase: "review",
      retryQueue: [{ iso3: "EGY", dueAt: 0 }],
    };
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe"],
    });
    expect(result.phase).toBe("normal");
    expect(result.sessionDone).toBe(true);
    expect(result.retryQueue).toEqual([]);
  });

  it("stays in review phase when queue still has in-scope entries", () => {
    const s: State = {
      ...withCurrent(initialState("name-to-click", ALL_CONTINENTS), "FRA"),
      phase: "review",
      retryQueue: [
        { iso3: "FRA", dueAt: 0 },
        { iso3: "EGY", dueAt: 0 },
      ],
    };
    const result = reducer(s, {
      type: "setContinents",
      continents: ["Europe"],
    });
    expect(result.phase).toBe("review");
    expect(result.sessionDone).toBe(false);
    expect(result.retryQueue.map((e) => e.iso3)).toEqual(["FRA"]);
  });
});

describe("reducer — SRS write-through (Quiz normal phase)", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("answer-correct in Quiz writes a Good grade to srsStore", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
    expect(s1.srsStore.facts.location["FRA"]).toBeDefined();
    expect(s1.srsStore.facts.location["FRA"].reps).toBe(1);
  });

  it("answer-wrong in Quiz writes an Again grade to srsStore", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "DEU", now: NOW });
    expect(s1.srsStore.facts.location["FRA"]).toBeDefined();
    expect(s1.srsStore.facts.location["FRA"].reps).toBe(1);
  });

  it("skip in Quiz writes an Again grade", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "skip", now: NOW });
    expect(s1.srsStore.facts.location["FRA"]).toBeDefined();
  });

  it("review-phase grades do NOT write to srsStore (no double-count)", () => {
    let s = withCurrent(initialState(), "FRA");
    // Force into review phase with a queued miss
    s = {
      ...s,
      phase: "review",
      retryQueue: [{ iso3: "FRA", dueAt: 0 }],
    };
    const s1 = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s1.srsStore.facts.location["FRA"]).toBeUndefined();
  });
});

describe("reducer — setPracticeMode", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("flips to Study and resets session counters", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const seeded: State = {
      ...s0,
      score: 5,
      streak: 3,
      total: 8,
      missed: [s0.current],
      missedSet: new Set(["FRA"]),
    };
    const next = reducer(seeded, {
      type: "setPracticeMode",
      mode: "study",
      now: NOW,
    });
    expect(next.practiceMode).toBe("study");
    expect(next.score).toBe(0);
    expect(next.streak).toBe(0);
    expect(next.total).toBe(0);
    expect(next.missed).toHaveLength(0);
  });

  it("starting a test round clears completedSet and retryQueue from an earlier test", () => {
    const s0 = withCurrent(initialState({ practiceMode: "study" }), "FRA");
    const seeded: State = {
      ...s0,
      retryQueue: [{ iso3: "FRA", dueAt: 5 }],
      completedSet: new Set(["DEU", "ITA"]),
    };
    const next = reducer(seeded, { type: "setPracticeMode", mode: "quiz", now: NOW });
    expect(next.retryQueue).toEqual([]);
    expect(next.completedSet.size).toBe(0);
  });

  it("preserves retryQueue and completedSet across the flip", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const seeded: State = {
      ...s0,
      retryQueue: [{ iso3: "FRA", dueAt: 5 }],
      completedSet: new Set(["DEU", "ITA"]),
    };
    const next = reducer(seeded, {
      type: "setPracticeMode",
      mode: "study",
      now: NOW,
    });
    expect(next.retryQueue.map((e) => e.iso3)).toEqual(["FRA"]);
    expect(Array.from(next.completedSet).sort()).toEqual(["DEU", "ITA"]);
  });

  it("preserves srsStore across the flip", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
    const next = reducer(s1, {
      type: "setPracticeMode",
      mode: "study",
      now: NOW,
    });
    expect(next.srsStore.facts.location["FRA"]).toEqual(s1.srsStore.facts.location["FRA"]);
  });
});

describe("reducer — Study mode grade flow", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  function studyState(): State {
    return withCurrent(
      { ...initialState(), practiceMode: "study" as const },
      "FRA",
    );
  }

  it("answer-wrong schedules auto-Again and shows feedback (no immediate write)", () => {
    const s0 = studyState();
    const s1 = reducer(s0, { type: "answer", iso3: "DEU", now: NOW });
    expect(s1.feedback?.kind).toBe("wrong");
    expect(s1.autoGradePending).toBe("Again");
    expect(s1.srsStore.facts.location["FRA"]).toBeUndefined();
  });

  it("answer-correct in Study defers auto-Good until dismiss", () => {
    const s0 = studyState();
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
    expect(s1.autoGradePending).toBe("Good");
    expect(s1.srsStore.facts.location["FRA"]).toBeUndefined();
    expect(s1.feedback?.kind).toBe("correct");

    const s2 = reducer(s1, { type: "dismiss", now: NOW });
    expect(s2.srsStore.facts.location["FRA"]).toBeDefined();
    expect(s2.autoGradePending).toBeNull();
  });

  it("skip in Study defers auto-Again until dismiss", () => {
    const s0 = studyState();
    const s1 = reducer(s0, { type: "skip", now: NOW });
    expect(s1.autoGradePending).toBe("Again");
    expect(s1.srsStore.facts.location["FRA"]).toBeUndefined();
    expect(s1.feedback?.kind).toBe("skipped");

    const s2 = reducer(s1, { type: "dismiss", now: NOW });
    expect(s2.srsStore.facts.location["FRA"]).toBeDefined();
    expect(s2.autoGradePending).toBeNull();
  });

  it("dismiss after a wrong commits Again and advances", () => {
    let s = studyState();
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s.autoGradePending).toBe("Again");
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.srsStore.facts.location["FRA"]).toBeDefined();
    expect(s.srsStore.facts.location["FRA"].reps).toBe(1);
    expect(s.feedback).toBeNull();
    expect(s.current.iso3).not.toBe("FRA");
  });

  it("increments newIntroducedThisStretch only on first-time grades", () => {
    let s = studyState();
    s = reducer(s, { type: "answer", iso3: "FRA", now: NOW });
    // Auto-Good is deferred; introduction is counted when the record
    // is actually written at dismiss time.
    expect(s.newIntroducedThisStretch).toBe(0);
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.newIntroducedThisStretch).toBe(1);
    // Second grade on same iso3 doesn't bump the stretch count.
    s = withCurrent(s, "FRA");
    s = reducer(s, { type: "answer", iso3: "FRA", now: NOW });
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.newIntroducedThisStretch).toBe(1);
  });

  it("introduction count rises when a wrong miss creates a new record", () => {
    let s = studyState();
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s.newIntroducedThisStretch).toBe(0);
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.newIntroducedThisStretch).toBe(1);
  });

  it("in-session resurface: a miss is queued a few cards out on dismiss", () => {
    let s = studyState();
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.studyStep).toBe(1);
    const entry = s.studyResurfaceQueue.find((e) => e.iso3 === "FRA");
    expect(entry).toBeDefined();
    // dueAt = newStep (1) + randInt(3, 5) → in [4, 6].
    expect(entry!.dueAt).toBeGreaterThanOrEqual(4);
    expect(entry!.dueAt).toBeLessThanOrEqual(6);
  });

  it("in-session resurface: a correct answer drops a queued card", () => {
    let s = studyState();
    s = { ...s, studyResurfaceQueue: [{ iso3: "FRA", dueAt: 0 }] };
    s = reducer(s, { type: "answer", iso3: "FRA", now: NOW });
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.studyResurfaceQueue.some((e) => e.iso3 === "FRA")).toBe(false);
  });

  it("in-session resurface: a repeat miss keeps a single entry", () => {
    let s = studyState();
    s = { ...s, studyResurfaceQueue: [{ iso3: "FRA", dueAt: 0 }] };
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    s = reducer(s, { type: "dismiss", now: NOW });
    const fraEntries = s.studyResurfaceQueue.filter((e) => e.iso3 === "FRA");
    expect(fraEntries).toHaveLength(1);
    expect(fraEntries[0].dueAt).toBeGreaterThanOrEqual(4);
  });

  it("setContinents prunes the resurface queue to scope", () => {
    let s = studyState();
    s = {
      ...s,
      studyResurfaceQueue: [
        { iso3: "JPN", dueAt: 0 },
        { iso3: "FRA", dueAt: 0 },
      ],
    };
    s = reducer(s, { type: "setContinents", continents: ["Europe"] });
    expect(s.studyResurfaceQueue.map((e) => e.iso3)).toEqual(["FRA"]);
  });

  it("setPracticeMode resets the resurface queue and step", () => {
    let s = studyState();
    s = {
      ...s,
      studyStep: 5,
      studyResurfaceQueue: [{ iso3: "FRA", dueAt: 9 }],
    };
    s = reducer(s, { type: "setPracticeMode", mode: "quiz", now: NOW });
    expect(s.studyStep).toBe(0);
    expect(s.studyResurfaceQueue).toEqual([]);
  });
});

describe("reducer — resetSrs / closeSummary", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("resetSrs empties the store but preserves practiceMode and continents", () => {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "answer", iso3: "FRA", now: NOW });
    expect(Object.keys(s.srsStore.facts.location)).toHaveLength(1);
    const next = reducer(s, { type: "resetSrs" });
    expect(next.srsStore.facts.location).toEqual({});
    expect(next.practiceMode).toBe(s.practiceMode);
    expect(next.selectedContinents).toBe(s.selectedContinents);
  });

  it("endSession in Study commits a pending auto-grade", () => {
    function studyState(): State {
      return withCurrent(
        { ...initialState(), practiceMode: "study" as const },
        "FRA",
      );
    }
    let s = studyState();
    s = reducer(s, { type: "answer", iso3: "FRA", now: NOW });
    expect(s.autoGradePending).toBe("Good");
    expect(s.srsStore.facts.location["FRA"]).toBeUndefined();
    s = reducer(s, { type: "endSession" });
    expect(s.sessionDone).toBe(true);
    expect(s.autoGradePending).toBeNull();
    expect(s.srsStore.facts.location["FRA"]).toBeDefined();
  });

  it("endSession in Study resurfaces an in-flight miss for the resumed session", () => {
    function studyState(): State {
      return withCurrent(
        { ...initialState(), practiceMode: "study" as const },
        "FRA",
      );
    }
    let s = studyState();
    // Miss, then bow out via "Done for now" before dismissing the reveal.
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s.autoGradePending).toBe("Again");
    s = reducer(s, { type: "endSession" });
    // The Again is committed AND the card is queued so it returns if the
    // user resumes via "Keep studying".
    expect(s.srsStore.facts.location["FRA"]).toBeDefined();
    const entry = s.studyResurfaceQueue.find((e) => e.iso3 === "FRA");
    expect(entry).toBeDefined();
    expect(entry!.dueAt).toBeGreaterThanOrEqual(s.studyStep + 3);
  });

  it("setContinents clears in-flight Study grade flags", () => {
    function studyState(): State {
      return withCurrent(
        { ...initialState(), practiceMode: "study" as const },
        "FRA",
      );
    }
    let s = studyState();
    // A wrong answer schedules an auto-Again.
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s.autoGradePending).toBe("Again");
    s = reducer(s, { type: "setContinents", continents: ALL_CONTINENTS });
    expect(s.autoGradePending).toBeNull();
    expect(s.feedback).toBeNull();
  });

  it("closeSummary clears sessionDone without nuking session state", () => {
    let s = withCurrent(initialState(), "FRA");
    s = { ...s, sessionDone: true, score: 7 };
    const next = reducer(s, { type: "closeSummary", now: NOW });
    expect(next.sessionDone).toBe(false);
    expect(next.score).toBe(7);
  });

  // The summary counts the card on screen, so Keep going must not pick past
  // an unanswered one: if it was the only card coming back, "1 coming back
  // first" would be false.
  it("closeSummary resumes on a Study card left unanswered by Done", () => {
    const s0 = initialState({ practiceMode: "study" });
    const ended = reducer(s0, { type: "endSession" });
    expect(ended.resumeCurrent).toBe(true);
    const back = reducer(ended, { type: "closeSummary", now: NOW });
    expect(back.current.iso3).toBe(s0.current.iso3);
    expect(back.resumeCurrent).toBe(false);
  });

  it("closeSummary moves on from a Study card answered before Done", () => {
    const s0 = initialState({ practiceMode: "study" });
    const answered = reducer(s0, { type: "answer", iso3: s0.current.iso3, now: NOW });
    const ended = reducer(answered, { type: "endSession" });
    expect(ended.resumeCurrent).toBe(false);
    const back = reducer(ended, { type: "closeSummary", now: NOW });
    expect(back.current.iso3).not.toBe(s0.current.iso3);
  });
});

describe("reducer — spotlight subregion", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");
  const SPOTLIGHT_CLEARED =
    "Nothing left to focus on in Southern Africa — back to all your regions.";

  function africaStudy(): State {
    return initialState({
      practiceMode: "study",
      selectedContinents: ["Africa"],
    });
  }

  it("setSpotlight narrows Study picks, resets the stretch cap, and closes the summary", () => {
    // Mirror the real activation path: the Focus CTA fires from the open
    // summary (sessionDone true) and is the *only* dispatch — so setSpotlight
    // must close the summary and pick exactly once.
    const base: State = {
      ...africaStudy(),
      newIntroducedThisStretch: 5,
      sessionDone: true,
    };
    const next = reducer(base, {
      type: "setSpotlight",
      subregion: "Western Africa",
      now: NOW,
    });
    expect(next.spotlightSubregion).toBe("Western Africa");
    // Activating a spotlight is a fresh stretch.
    expect(next.newIntroducedThisStretch).toBe(0);
    // The next pick comes from the focused subregion.
    expect(next.current.subregion).toBe("Western Africa");
    // The summary is dismissed in the same step.
    expect(next.sessionDone).toBe(false);
  });

  it("clearSpotlight clears the lens", () => {
    const s = reducer(africaStudy(), {
      type: "setSpotlight",
      subregion: "Western Africa",
      now: NOW,
    });
    expect(s.spotlightSubregion).toBe("Western Africa");
    // Mid-round, with a miss reveal's grade still staged: clearing is only
    // a lens change, so the card, the round and the grade all stay.
    const mid: State = { ...s, roundCards: 4, autoGradePending: "Again" };
    const cleared = reducer(mid, { type: "clearSpotlight" });
    expect(cleared.spotlightSubregion).toBeNull();
    expect(cleared.current).toBe(mid.current);
    expect(cleared.roundCards).toBe(4);
    expect(cleared.autoGradePending).toBe("Again");
  });

  it("setContinents clears the spotlight", () => {
    const s = reducer(africaStudy(), {
      type: "setSpotlight",
      subregion: "Western Africa",
      now: NOW,
    });
    const next = reducer(s, {
      type: "setContinents",
      continents: ["Africa", "Europe"],
    });
    expect(next.spotlightSubregion).toBeNull();
  });

  it("setPracticeMode('quiz') clears the spotlight", () => {
    const s = reducer(africaStudy(), {
      type: "setSpotlight",
      subregion: "Western Africa",
      now: NOW,
    });
    const next = reducer(s, {
      type: "setPracticeMode",
      mode: "quiz",
      now: NOW,
    });
    expect(next.spotlightSubregion).toBeNull();
  });

  it("setMode (question-mode flip) keeps the spotlight", () => {
    // Unlike a practice-mode flip, which starts a different KIND of round,
    // changing the question keeps the learner in the same sitting over the
    // same places. The lens they switched on is theirs until they clear it.
    const s = reducer(africaStudy(), {
      type: "setSpotlight",
      subregion: "Western Africa",
      now: NOW,
    });
    const next = reducer(s, { type: "setMode", mode: "shape-to-name" });
    expect(next.spotlightSubregion).toBe("Western Africa");
    expect(next.current.subregion).toBe("Western Africa");
  });

  it("reload (fresh initialState) does not carry the spotlight", () => {
    expect(initialState().spotlightSubregion).toBeNull();
    expect(initialState({ practiceMode: "study" }).transientMessage).toBeNull();
  });

  it("depletes mid-session via dismissFeedback: auto-clears, re-picks full pool, toasts", () => {
    const tenDaysAgo = new Date(NOW.getTime() - 10 * 86_400_000);
    const seeded: State = {
      ...withCurrent(africaStudy(), "ZAF"), // Southern Africa
      spotlightSubregion: "Southern Africa",
      // Cap hit → no fresh introductions possible in the focused region.
      newIntroducedThisStretch: STUDY_NEW_CAP,
      feedback: { kind: "correct", answerIso3: "ZAF", correctIso3: "ZAF", at: 0 },
      autoGradePending: "Good",
      // A due card outside the spotlight region, so the widened re-pick has
      // somewhere to land.
      srsStore: storeWith({ EGY: srsGrade(null, "Again", tenDaysAgo) }),
    };
    const next = reducer(seeded, { type: "dismiss", now: NOW });
    expect(next.spotlightSubregion).toBeNull();
    expect(next.transientMessage).toBe(SPOTLIGHT_CLEARED);
    // Re-pick came from the full continent pool (the due EGY), not Southern Africa.
    expect(next.current.iso3).toBe("EGY");
  });

  it("a spent new-card allowance does not deplete a focus via closeSummary", () => {
    // Keep going on the rest card refills the allowance while unseen
    // countries remain, so the focus region introduces new ones instead of
    // clearing with "nothing left to focus on" (#54).
    const seeded: State = {
      ...withCurrent(africaStudy(), "EGY"),
      spotlightSubregion: "Southern Africa",
      newIntroducedThisStretch: STUDY_NEW_CAP,
      srsStore: emptyStore(),
      sessionDone: true,
    };
    const next = reducer(seeded, { type: "closeSummary", now: NOW });
    expect(next.spotlightSubregion).toBe("Southern Africa");
    expect(next.transientMessage).toBeNull();
    expect(next.sessionDone).toBe(false);
    expect(next.newIntroducedThisStretch).toBe(0);
    expect(next.current.subregion).toBe("Southern Africa");
  });

  it("Quiz mode ignores spotlightSubregion (defense-in-depth)", () => {
    const africaIso3s = ALL_COUNTRIES.filter(
      (c) => c.continent === "Africa",
    ).map((c) => c.iso3);
    // Complete every African country except EGY, so the only fresh quiz pick
    // is EGY — which is NOT in the (defensively-set) Southern Africa spotlight.
    const completedSet = new Set(africaIso3s.filter((i) => i !== "EGY"));
    const seeded: State = {
      ...withCurrent(
        initialState({ practiceMode: "quiz", selectedContinents: ["Africa"] }),
        "ZAF",
      ),
      spotlightSubregion: "Southern Africa",
      completedSet,
      sessionDone: true,
    };
    const next = reducer(seeded, { type: "closeSummary", now: NOW });
    // Quiz pick is continent-scoped, not narrowed to the spotlight subregion.
    expect(next.current.iso3).toBe("EGY");
  });
});

describe("reducer — setContinents in Study", () => {
  it("replaces an out-of-scope card by introduction order, not at random", () => {
    const s0 = withCurrent(initialState({ practiceMode: "study" }), "FRA");
    const next = reducer(s0, { type: "setContinents", continents: ["Africa"] });
    expect(next.current.continent).toBe("Africa");
    const best = Math.max(
      ...ALL_COUNTRIES.filter((c) => c.continent === "Africa").map(introductionOrder),
    );
    expect(introductionOrder(next.current)).toBe(best);
  });

  it("keeps the current card when it is still in scope", () => {
    const s0 = initialState({ practiceMode: "study" });
    const next = reducer(s0, {
      type: "setContinents",
      continents: [s0.current.continent],
    });
    expect(next.current).toBe(s0.current);
  });
});

describe("reducer — rounds of twelve", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  // Answer the current card correctly and dismiss it, as the correct-flash
  // timer would. One full card advance in either practice mode.
  function playCorrect(s: State): State {
    const answered = reducer(s, { type: "answer", iso3: s.current.iso3, now: NOW });
    return reducer(answered, { type: "dismiss", now: NOW });
  }
  function playMiss(s: State): State {
    const answered = reducer(s, { type: "skip", now: NOW });
    return reducer(answered, { type: "dismiss", now: NOW });
  }
  // A round ends early once nothing useful is left, and a spent new-card
  // allowance ends it even after Keep going anyway. Tests about full
  // twelve-card rounds start from a caught-up sitting (nothing unseen) that
  // has already chosen to keep going anyway.
  function studyFullRounds(): State {
    return { ...caughtUpOceania(), fillerAccepted: true };
  }

  it("counts a card only when its feedback dismisses", () => {
    const s0 = initialState({ practiceMode: "study" });
    const s1 = reducer(s0, { type: "answer", iso3: s0.current.iso3, now: NOW });
    expect(s1.roundCards).toBe(0);
    const s2 = reducer(s1, { type: "dismiss", now: NOW });
    expect(s2.roundCards).toBe(1);
    expect(s2.roundRight).toBe(1);
    expect(s2.roundNew).toBe(1);
    expect(s2.roundDone).toBe(false);
  });

  it("a miss counts the card but not as right, and a repeat is not new", () => {
    let s = initialState({ practiceMode: "study" });
    s = playMiss(s);
    expect(s.roundCards).toBe(1);
    expect(s.roundRight).toBe(0);
    expect(s.roundNew).toBe(1);
    // Force the same card back and answer it: seen before, so not new.
    const iso3 = Object.keys(s.srsStore.facts.location)[0];
    const seen = playCorrect(withCurrent(s, iso3));
    expect(seen.roundNew).toBe(1);
    expect(seen.roundRight).toBe(1);
  });

  it("opens the round break on the twelfth card and blocks answers until continued", () => {
    let s = studyFullRounds();
    for (let i = 0; i < ROUND_SIZE - 1; i++) s = playCorrect(s);
    expect(s.roundDone).toBe(false);
    expect(s.roundsCompleted).toBe(0);
    s = playCorrect(s);
    expect(s.roundCards).toBe(ROUND_SIZE);
    expect(s.roundDone).toBe(true);
    expect(s.roundsCompleted).toBe(1);
    expect(s.feedback).toBeNull();
    // Input is ignored while the break is up.
    const blocked = reducer(s, { type: "answer", iso3: s.current.iso3, now: NOW });
    expect(blocked).toBe(s);
    const skipped = reducer(s, { type: "skip", now: NOW });
    expect(skipped).toBe(s);
    // Keep going: counters reset, rounds completed persists, card kept.
    const next = reducer(s, { type: "continueRound", now: NOW });
    expect(next.roundDone).toBe(false);
    expect(next.roundCards).toBe(0);
    expect(next.roundRight).toBe(0);
    expect(next.roundNew).toBe(0);
    expect(next.roundsCompleted).toBe(1);
    expect(next.current).toBe(s.current);
  });

  it("continueRound is a no-op when no round break is up", () => {
    const s = initialState({ practiceMode: "study" });
    expect(reducer(s, { type: "continueRound", now: NOW })).toBe(s);
  });

  it("Done for now from the break ends the session and credits the round", () => {
    let s = studyFullRounds();
    for (let i = 0; i < ROUND_SIZE; i++) s = playCorrect(s);
    const ended = reducer(s, { type: "endSession" });
    expect(ended.sessionDone).toBe(true);
    expect(ended.roundDone).toBe(false);
    expect(ended.roundsCompleted).toBe(1);
    // Closing the summary starts a fresh round.
    const back = reducer(ended, { type: "closeSummary", now: NOW });
    expect(back.roundCards).toBe(0);
    expect(back.roundDone).toBe(false);
  });

  it("rounds also run in a test round (quiz) and the summary wins over the break", () => {
    let s = initialState({ practiceMode: "quiz", selectedContinents: ["Europe"] });
    for (let i = 0; i < ROUND_SIZE; i++) s = playCorrect(s);
    expect(s.roundDone).toBe(true);
    expect(s.roundRight).toBe(ROUND_SIZE);
    expect(s.score).toBe(ROUND_SIZE);
    // The round break never shows on top of a finished session: a scope
    // that completes on the twelfth card goes straight to the summary.
    const pool = ALL_COUNTRIES.filter((c) => c.continent === "Antarctica");
    expect(pool.length).toBeLessThan(ROUND_SIZE);
    let a = initialState({
      practiceMode: "quiz",
      selectedContinents: ["Antarctica"],
      includeTerritories: true,
    });
    while (!a.sessionDone) a = playCorrect(a);
    expect(a.roundDone).toBe(false);
  });

  it("a test's break and summary reconcile, scored on first tries (#64)", () => {
    // The review's run: twelve South American countries, the first skipped
    // and found on its retry after the break. Once the break said "11 of 12
    // right" and the summary "92% Right" with the skipped one still missed.
    const scope = new Set(
      filterPool(["South America"], false, "location").map((c) => c.iso3),
    );
    expect(scope.size).toBe(ROUND_SIZE);
    const tally = (st: State) => testTally(scope, st.completedSet, st.missedSet);
    let s = initialState({ practiceMode: "quiz", selectedContinents: ["South America"] });
    const skipped = s.current.iso3;
    s = playMiss(s);
    // Hold the retry back until every fresh country has been asked.
    s = { ...s, retryQueue: s.retryQueue.map((e) => ({ ...e, dueAt: 1000 })) };
    while (!s.roundDone && !s.sessionDone) s = playCorrect(s);
    expect(s.roundDone).toBe(true);
    expect(s.sessionDone).toBe(false);
    expect(tally(s)).toEqual({
      size: 12,
      firstTry: 11,
      recovered: 0,
      stillMissed: 1,
      notAsked: 0,
    });
    s = reducer(s, { type: "continueRound", now: NOW });
    expect(s.current.iso3).toBe(skipped);
    s = playCorrect(s);
    expect(s.sessionDone).toBe(true);
    expect(tally(s)).toEqual({
      size: 12,
      firstTry: 11,
      recovered: 1,
      stillMissed: 0,
      notAsked: 0,
    });
  });

  it("counts the sitting across round breaks and resets it when the summary closes", () => {
    let s = studyFullRounds();
    for (let i = 0; i < ROUND_SIZE; i++) s = playCorrect(s);
    // STUDY_NEW_CAP holds some of the twelve back from being new.
    const firstRoundNew = s.roundNew;
    s = reducer(s, { type: "continueRound", now: NOW });
    s = playMiss(s);
    expect(s.roundCards).toBe(1);
    expect(s.sittingCards).toBe(ROUND_SIZE + 1);
    expect(s.sittingRight).toBe(ROUND_SIZE);
    expect(s.sittingNew).toBe(firstRoundNew + s.roundNew);
    const ended = reducer(s, { type: "endSession" });
    expect(ended.sittingCards).toBe(ROUND_SIZE + 1);
    const back = reducer(ended, { type: "closeSummary", now: NOW });
    expect(back.sittingCards).toBe(0);
    expect(back.sittingRight).toBe(0);
    expect(back.sittingNew).toBe(0);
  });

  it("ends a round early, and credits it, once nothing useful is left", () => {
    let s = initialState({ practiceMode: "study" });
    for (let i = 0; i < STUDY_NEW_CAP - 1; i++) s = playCorrect(s);
    expect(s.roundDone).toBe(false);
    // The last new card of the stretch: everything after it would be filler.
    s = playCorrect(s);
    expect(s.roundCards).toBe(STUDY_NEW_CAP);
    expect(s.roundEndedEarly).toBe(true);
    expect(s.roundDone).toBe(true);
    expect(s.roundsCompleted).toBe(1);
    expect(cardIsFiller(s, NOW)).toBe(true);
  });

  it("asks a pending miss before ending the round early", () => {
    let s = initialState({ practiceMode: "study" });
    for (let i = 0; i < STUDY_NEW_CAP - 2; i++) s = playCorrect(s);
    const missed = s.current.iso3;
    s = playMiss(s);
    // The tenth new card: nothing due, no new card allowed, but the miss is
    // still waiting out its gap — it comes forward instead of the round ending.
    s = playCorrect(s);
    expect(s.roundDone).toBe(false);
    expect(s.current.iso3).toBe(missed);
    expect(cardIsFiller(s, NOW)).toBe(false);
    s = playCorrect(s);
    expect(s.roundCards).toBe(STUDY_NEW_CAP + 1);
    expect(s.roundDone).toBe(true);
    expect(s.sittingRecovered.has(`location:${missed}`)).toBe(true);
  });

  it("Keep going after the new-card cap refills it rather than serving repeats", () => {
    let s = initialState({ practiceMode: "study" });
    while (!s.roundDone) s = playCorrect(s);
    expect(s.roundEndedEarly).toBe(true);
    expect(newCapReached(s)).toBe(true);
    s = reducer(s, { type: "continueRound", now: NOW });
    expect(s.fillerAccepted).toBe(false);
    expect(s.newIntroducedThisStretch).toBe(0);
    expect(s.srsStore.facts.location[s.current.iso3]).toBeUndefined();
    s = playCorrect(s);
    expect(s.roundNew).toBe(1);
  });

  it("Keep going starts a fresh allowance even when the last one was not spent", () => {
    // Round one met seven new around its retries; without a per-round refill
    // round two would reach the cap on its fourth card and end there.
    const s: State = {
      ...initialState({ practiceMode: "study" }),
      newIntroducedThisStretch: 7,
      roundCards: ROUND_SIZE,
      roundDone: true,
    };
    const next = reducer(s, { type: "continueRound", now: NOW });
    expect(next.newIntroducedThisStretch).toBe(0);
    expect(next.roundDone).toBe(false);
  });

  it("closing the rest card refills the new-card cap too", () => {
    let s = initialState({ practiceMode: "study" });
    while (!s.roundDone) s = playCorrect(s);
    const ended = reducer(s, { type: "endSession" });
    const back = reducer(ended, { type: "closeSummary", now: NOW });
    expect(back.newIntroducedThisStretch).toBe(0);
    expect(back.srsStore.facts.location[back.current.iso3]).toBeUndefined();
    // It lands on useful work, so a later run of filler still gets asked about.
    expect(back.fillerAccepted).toBe(false);
  });

  it("holds the round open for a miss on the last useful card", () => {
    let s = initialState({ practiceMode: "study" });
    for (let i = 0; i < STUDY_NEW_CAP - 1; i++) s = playCorrect(s);
    const missed = s.current.iso3;
    s = playMiss(s);
    // Nothing useful is left but the miss, which can't be asked straight
    // back: one met card runs, then the miss returns.
    expect(s.roundDone).toBe(false);
    expect(s.roundEndedEarly).toBe(false);
    expect(cardIsFiller(s, NOW)).toBe(true);
    s = playCorrect(s);
    expect(s.current.iso3).toBe(missed);
    s = playCorrect(s);
    expect(s.roundDone).toBe(true);
    expect(s.sittingRecovered.has(`location:${missed}`)).toBe(true);
  });

  // Every Oceania country met and not due, except the first, which is due now.
  function caughtUpOceania(): State {
    const pool = ALL_COUNTRIES.filter(
      (c) => c.continent === "Oceania" && !c.territory,
    );
    const past = new Date(NOW.getTime() - 86_400_000);
    const records: Record<string, SrsRecord> = {};
    pool.forEach((c, i) => {
      const due = NOW.getTime() + (i === 0 ? -60_000 : 86_400_000);
      records[c.iso3] = {
        ...srsGrade(null, "Good", past),
        due: new Date(due).toISOString(),
      };
    });
    return initialState({
      practiceMode: "study",
      selectedContinents: ["Oceania"],
      srsStore: storeWith(records),
    });
  }

  it("Keep going when truly caught up runs full rounds until the sitting ends", () => {
    let s = caughtUpOceania();
    expect(cardIsFiller(s, NOW)).toBe(false);
    s = playCorrect(s);
    expect(s.roundCards).toBe(1);
    expect(s.roundEndedEarly).toBe(true);
    expect(s.roundDone).toBe(true);
    expect(newCapReached(s)).toBe(false);
    s = reducer(s, { type: "continueRound", now: NOW });
    expect(s.fillerAccepted).toBe(true);
    expect(s.roundEndedEarly).toBe(false);
    for (let i = 0; i < ROUND_SIZE - 1; i++) s = playCorrect(s);
    expect(s.roundDone).toBe(false);
    s = playCorrect(s);
    expect(s.roundDone).toBe(true);
    expect(s.roundsCompleted).toBe(2);
    // Keep going (anyway) on the rest card is the same choice: closing it onto
    // a filler card accepts filler, so the CaughtUp banner does not ask again.
    const ended = reducer(s, { type: "endSession" });
    const back = reducer(ended, { type: "closeSummary", now: NOW });
    expect(cardIsFiller(back, NOW)).toBe(true);
    expect(back.fillerAccepted).toBe(true);
  });

  it("taking the capitals door from a caught-up break does not accept filler", () => {
    let s = playCorrect(caughtUpOceania());
    expect(s.roundEndedEarly).toBe(true);
    // The door dispatches the mode switch first, then continues the round.
    s = reducer(s, { type: "setMode", mode: "country-to-capital", now: NOW });
    s = reducer(s, { type: "continueRound", now: NOW });
    expect(s.roundDone).toBe(false);
    expect(s.mode).toBe("country-to-capital");
    expect(cardIsFiller(s, NOW)).toBe(false);
    expect(s.fillerAccepted).toBe(false);
  });

  it("a spent new-card allowance ends the round even after Keep going anyway", () => {
    // Anyway was chosen, then unseen countries came within reach (a wider
    // scope, say): the round still ends at the cap, so Keep going can refill
    // rather than pad the round with repeats.
    let s: State = { ...initialState({ practiceMode: "study" }), fillerAccepted: true };
    while (!s.roundDone) s = playCorrect(s);
    expect(s.roundCards).toBe(STUDY_NEW_CAP);
    expect(s.roundEndedEarly).toBe(true);
    expect(newCapReached(s)).toBe(true);
  });

  it("a queued miss means something useful is left, so nothing asks about filler", () => {
    // The due card answered, so nothing else in Oceania is due.
    const s = playCorrect(caughtUpOceania());
    const [filler, missed] = ALL_COUNTRIES.filter(
      (c) => c.continent === "Oceania" && !c.territory,
    ).slice(1, 3);
    const onFiller = withCurrent(
      { ...s, studyResurfaceQueue: [{ iso3: missed.iso3, dueAt: 99 }] },
      filler.iso3,
    );
    expect(cardIsFiller(onFiller, NOW)).toBe(true);
    expect(nothingUseful(onFiller, NOW)).toBe(false);
    expect(nothingUseful(withCurrent(s, filler.iso3), NOW)).toBe(true);
  });

  it("closing the rest card onto filler in a focus does not accept filler", () => {
    const s = playCorrect(caughtUpOceania());
    const ended = reducer(s, { type: "endSession" });
    const back = reducer(
      { ...ended, spotlightSubregion: "Melanesia" },
      { type: "closeSummary", now: NOW },
    );
    expect(back.current.subregion).toBe("Melanesia");
    expect(cardIsFiller(back, NOW)).toBe(true);
    expect(back.fillerAccepted).toBe(false);
  });

  function oceania(): Country[] {
    return ALL_COUNTRIES.filter((c) => c.continent === "Oceania" && !c.territory);
  }

  it("something due elsewhere in the pool means nothing asks about filler", () => {
    const [due, filler] = oceania();
    const onFiller = withCurrent(caughtUpOceania(), filler.iso3);
    expect(cardIsFiller(onFiller, NOW)).toBe(true);
    expect(nothingUseful(onFiller, NOW)).toBe(false);
    expect(due.iso3).not.toBe(filler.iso3);
  });

  it("closing the rest card re-picks a resumed filler card when something is due", () => {
    const [due, filler] = oceania();
    const resting: State = {
      ...withCurrent(caughtUpOceania(), filler.iso3),
      sessionDone: true,
      resumeCurrent: true,
    };
    const back = reducer(resting, { type: "closeSummary", now: NOW });
    expect(back.current.iso3).toBe(due.iso3);
    expect(back.fillerAccepted).toBe(false);
  });

  it("leaving a focus clears Keep going anyway and moves off a filler card", () => {
    const [due, ...rest] = oceania();
    const melanesian = rest.find((c) => c.subregion === "Melanesia")!;
    const focused: State = {
      ...withCurrent(caughtUpOceania(), melanesian.iso3),
      spotlightSubregion: "Melanesia",
      fillerAccepted: true,
    };
    const left = reducer(focused, { type: "clearSpotlight", now: NOW });
    expect(left.spotlightSubregion).toBeNull();
    expect(left.fillerAccepted).toBe(false);
    expect(left.current.iso3).toBe(due.iso3);
  });

  it("a scope change clears Keep going anyway and moves off a filler card", () => {
    const accepted = reducer(playCorrect(caughtUpOceania()), {
      type: "continueRound",
      now: NOW,
    });
    expect(accepted.fillerAccepted).toBe(true);
    const wider = reducer(accepted, {
      type: "setContinents",
      continents: ["Oceania", "Europe"],
      now: NOW,
    });
    expect(wider.fillerAccepted).toBe(false);
    expect(wider.srsStore.facts.location[wider.current.iso3]).toBeUndefined();
  });

  it("leaving a focus or changing scope starts a fresh new-card allowance", () => {
    const spent: State = {
      ...initialState({ practiceMode: "study" }),
      newIntroducedThisStretch: STUDY_NEW_CAP,
      spotlightSubregion: "Western Europe",
    };
    expect(
      reducer(spent, { type: "clearSpotlight", now: NOW }).newIntroducedThisStretch,
    ).toBe(0);
    const wider = reducer(
      { ...spent, spotlightSubregion: null },
      { type: "setContinents", continents: ["Europe", "Asia"], now: NOW },
    );
    expect(wider.newIntroducedThisStretch).toBe(0);
  });

  it("acceptFiller keeps a round from ending early", () => {
    let s = caughtUpOceania();
    s = reducer(s, { type: "acceptFiller" });
    expect(reducer(s, { type: "acceptFiller" })).toBe(s);
    for (let i = 0; i < ROUND_SIZE; i++) s = playCorrect(s);
    expect(s.roundCards).toBe(ROUND_SIZE);
    expect(s.roundEndedEarly).toBe(false);
  });

  it("counts a miss answered right later in the sitting as a recovery, once", () => {
    let s = initialState({ practiceMode: "study" });
    s = playMiss(withCurrent(s, "FRA"));
    expect(s.sittingMissed.has("location:FRA")).toBe(true);
    expect(s.sittingRecovered.size).toBe(0);
    s = playCorrect(withCurrent(s, "FRA"));
    expect([...s.sittingRecovered]).toEqual(["location:FRA"]);
    // Missed and put right again: still one country.
    s = playCorrect(withCurrent(playMiss(withCurrent(s, "FRA")), "FRA"));
    expect(s.sittingRecovered.size).toBe(1);
    // A card Done closes mid-reveal counts too.
    s = playMiss(withCurrent(s, "DEU"));
    const answered = reducer(withCurrent(s, "DEU"), {
      type: "answer",
      iso3: "DEU",
      now: NOW,
    });
    const ended = reducer(answered, { type: "endSession" });
    expect(ended.sittingRecovered.has("location:DEU")).toBe(true);
    const back = reducer(ended, { type: "closeSummary", now: NOW });
    expect(back.sittingRecovered.size).toBe(0);
    expect(back.sittingMissed.size).toBe(0);
  });

  it("does not count a right answer on a card first answered right as a recovery", () => {
    let s = initialState({ practiceMode: "study" });
    s = playCorrect(withCurrent(s, "FRA"));
    s = playCorrect(withCurrent(s, "FRA"));
    expect(s.sittingRecovered.size).toBe(0);
  });

  it("counts a card Done closes mid-reveal into the sitting", () => {
    const s0 = initialState({ practiceMode: "study" });
    const answered = reducer(s0, { type: "answer", iso3: s0.current.iso3, now: NOW });
    const ended = reducer(answered, { type: "endSession" });
    expect(ended.roundCards).toBe(0);
    expect(ended.sittingCards).toBe(1);
    expect(ended.sittingRight).toBe(1);
    expect(ended.sittingNew).toBe(1);
  });

  it("keeps the sitting across a question-mode switch", () => {
    let s = initialState({ practiceMode: "study" });
    s = playCorrect(s);
    s = reducer(s, { type: "setMode", mode: "shape-to-name", now: NOW });
    expect(s.sittingCards).toBe(1);
  });

  it("Focus on a subregion from the summary starts a fresh round", () => {
    let s = initialState({ practiceMode: "study" });
    for (let i = 0; i < ROUND_SIZE; i++) s = playCorrect(s);
    const ended = reducer(s, { type: "endSession" });
    const focused = reducer(ended, {
      type: "setSpotlight",
      subregion: "Western Africa",
      now: NOW,
    });
    expect(focused.spotlightSubregion).toBe("Western Africa");
    expect(focused.roundCards).toBe(0);
    expect(focused.roundDone).toBe(false);
    expect(focused.roundsCompleted).toBe(1);
    // One more card is card 1 of a new round, not card 13 of the old one.
    const one = playCorrect(focused);
    expect(one.roundCards).toBe(1);
    expect(one.roundDone).toBe(false);
  });

  it("a practice-mode flip and startReview both start a fresh round", () => {
    let s = initialState({ practiceMode: "study" });
    for (let i = 0; i < 5; i++) s = playCorrect(s);
    const flipped = reducer(s, { type: "setPracticeMode", mode: "quiz", now: NOW });
    expect(flipped.roundCards).toBe(0);
    let q = initialState({ practiceMode: "quiz" });
    q = playMiss(q);
    q = playCorrect(q);
    const ended = reducer(q, { type: "endSession" });
    const review = reducer(ended, { type: "startReview" });
    expect(review.phase).toBe("review");
    expect(review.roundCards).toBe(0);
  });
});

describe("reducer — territories setting", () => {
  it("keeps territories out of the pool by default and lets them in on demand", () => {
    // Greenland is a territory: out of scope until the setting is on, so a
    // scope change replaces it as the current card.
    const s0 = withCurrent(initialState({ selectedContinents: ["North America"] }), "GRL");
    expect(s0.includeTerritories).toBe(false);
    const narrowed = reducer(s0, { type: "setContinents", continents: ["North America"] });
    expect(narrowed.current.iso3).not.toBe("GRL");
    expect(narrowed.current.territory).toBeUndefined();

    const on = reducer(s0, { type: "setIncludeTerritories", value: true });
    expect(on.includeTerritories).toBe(true);
    // Now in scope: the current card survives the same scope change.
    const kept = reducer(withCurrent(on, "GRL"), {
      type: "setContinents",
      continents: ["North America"],
    });
    expect(kept.current.iso3).toBe("GRL");
  });

  it("is a no-op when the value does not change", () => {
    const s = initialState();
    expect(reducer(s, { type: "setIncludeTerritories", value: false })).toBe(s);
  });

  it("falls back to the whole world when Antarctica alone is left with territories off", () => {
    const s0 = initialState({ selectedContinents: ["Antarctica"], includeTerritories: true });
    expect(s0.current.continent).toBe("Antarctica");
    const off = reducer(s0, { type: "setIncludeTerritories", value: false });
    expect(off.selectedContinents).toEqual(ALL_CONTINENTS);
    expect(off.current.territory).toBeUndefined();
  });

  it("loads a persisted Antarctica-only selection without crashing", () => {
    // Before the setting existed, Antarctica alone was a valid two-country
    // pool; with territories off it is empty. Fall back to the world.
    const s = initialState({ selectedContinents: ["Antarctica"] });
    expect(s.selectedContinents).toEqual(ALL_CONTINENTS);
    expect(s.current.territory).toBeUndefined();
  });

  it("keeps the continent selection across the toggle, pool aside", () => {
    const s0 = initialState({ selectedContinents: ["Antarctica", "Europe"], includeTerritories: true });
    const off = reducer(s0, { type: "setIncludeTerritories", value: false });
    // Antarctica stays selected (its chip is merely hidden) so turning
    // territories back on restores exactly the old scope.
    expect(off.selectedContinents).toEqual(["Antarctica", "Europe"]);
    expect(off.current.continent).toBe("Europe");
    const on = reducer(off, { type: "setIncludeTerritories", value: true });
    expect(on.selectedContinents).toEqual(["Antarctica", "Europe"]);
  });

  it("keeps a review pass on queued cards when the current one leaves scope", () => {
    const s0: State = {
      ...withCurrent(initialState({ includeTerritories: true }), "GRL"),
      phase: "review",
      retryQueue: [{ iso3: "GRL", dueAt: 0 }, { iso3: "FRA", dueAt: 1 }],
    };
    const off = reducer(s0, { type: "setIncludeTerritories", value: false });
    expect(off.phase).toBe("review");
    expect(off.retryQueue.map((e) => e.iso3)).toEqual(["FRA"]);
    expect(off.current.iso3).toBe("FRA");
  });

  it("commits a pending Study grade before the scope changes", () => {
    const NOW = new Date("2026-09-05T12:00:00Z");
    const s0 = withCurrent(initialState({ practiceMode: "study" }), "FRA");
    const missed = reducer(s0, { type: "skip", now: NOW });
    expect(missed.autoGradePending).toBe("Again");
    const toggled = reducer(missed, { type: "setIncludeTerritories", value: true, now: NOW });
    expect(toggled.autoGradePending).toBeNull();
    expect(toggled.feedback).toBeNull();
    expect(toggled.srsStore.facts.location["FRA"]?.misses).toBe(1);
    expect(toggled.studyResurfaceQueue.map((e) => e.iso3)).toEqual(["FRA"]);
  });

  it("prunes the retry queue to the new scope and survives mode/reset", () => {
    const s0 = { ...initialState({ includeTerritories: true }), retryQueue: [{ iso3: "GRL", dueAt: 3 }, { iso3: "FRA", dueAt: 4 }] };
    const off = reducer(s0, { type: "setIncludeTerritories", value: false });
    expect(off.retryQueue.map((e) => e.iso3)).toEqual(["FRA"]);
    expect(reducer(off, { type: "setMode", mode: "shape-to-name" }).includeTerritories).toBe(false);
    const on = reducer(off, { type: "setIncludeTerritories", value: true });
    expect(reducer(on, { type: "reset" }).includeTerritories).toBe(true);
  });
});

describe("reducer — ceremony (R2.2)", () => {
  const T0 = new Date("2026-05-16T12:00:00Z");

  function studyAt(iso3: string, extra: Partial<State> = {}): State {
    return {
      ...withCurrent(initialState({ practiceMode: "study" }), iso3),
      ...extra,
    };
  }

  // A record already graduated to Review, so the next correct answer cannot
  // cross into "known" again.
  function knownRecord() {
    return { ...srsGrade(null, "Good", T0), state: 2 as const };
  }

  it("counts a run of correct answers in Study, where the copy reads it", () => {
    const s1 = reducer(studyAt("FRA", { streak: 4 }), {
      type: "answer",
      iso3: "FRA",
      now: T0,
    });
    expect(s1.streak).toBe(5);
  });

  it("breaks the run on a Study miss", () => {
    const s1 = reducer(studyAt("FRA", { streak: 7 }), {
      type: "answer",
      iso3: "DEU",
      now: T0,
    });
    expect(s1.streak).toBe(0);
  });

  it("breaks the run on a Study skip", () => {
    const s1 = reducer(studyAt("FRA", { streak: 7 }), { type: "skip", now: T0 });
    expect(s1.streak).toBe(0);
  });

  it("marks a country crossing into known on the answer that does it", () => {
    // A brand-new card graded Good goes to Learning, not Review, so this is
    // the case where nothing is marked...
    const fresh = reducer(studyAt("FRA"), {
      type: "answer",
      iso3: "FRA",
      now: T0,
    });
    expect(fresh.milestone).toBeNull();

    // ...and this is the case where something is. One Good puts the card in
    // learning; answering the next one after the learning step has elapsed
    // graduates it to Review, which is the crossing the ceremony marks.
    const almost = srsGrade(null, "Good", T0);
    expect(almost.state).toBeLessThan(2); // guard: the seed must not be known
    const later = new Date(T0.getTime() + 60 * 60 * 1000);
    expect(crossesIntoKnown(almost, srsGrade(almost, "Good", later))).toBe(true);

    const s0 = studyAt("FRA", {
      srsStore: storeWith({ FRA: almost }),
    });
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: later });
    expect(s1.milestone).not.toBeNull();
    expect(s1.milestone!.iso3).toBe("FRA");
  });

  it("marks nothing for a country that is already known", () => {
    const s0 = studyAt("FRA", {
      srsStore: storeWith({ FRA: knownRecord() }),
    });
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: T0 });
    expect(s1.milestone).toBeNull();
  });

  it("marks nothing during a test round, where the map is neutral anyway", () => {
    const s0 = withCurrent(initialState(), "FRA"); // practiceMode defaults to quiz
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: T0 });
    expect(s1.practiceMode).toBe("quiz");
    expect(s1.milestone).toBeNull();
  });

  it("ends the ceremony with the card that earned it", () => {
    const s0 = studyAt("FRA", {
      milestone: { iso3: "FRA", name: "France", continentComplete: null },
      autoGradePending: "Good" as const,
      feedback: {
        kind: "correct" as const,
        answerIso3: "FRA",
        correctIso3: "FRA",
        at: 0,
      },
    });
    const s1 = reducer(s0, { type: "dismiss", now: T0 });
    expect(s1.milestone).toBeNull();
  });

  it("builds the run on a correct answer during a Quiz review pass", () => {
    // Symmetric with the miss case below: a phase where a run can only be
    // lost and never built would freeze the streak just below a threshold.
    const s0 = withCurrent(
      {
        ...initialState(),
        phase: "review" as const,
        streak: 4,
        retryQueue: [{ iso3: "FRA", dueAt: 0 }],
      },
      "FRA",
    );
    // Pin the branch, not just the numbers: Study would also give streak 5
    // with score and total at 0, so without these the test would keep passing
    // if initialState's test-only practiceMode default ever flipped.
    expect(s0.practiceMode).toBe("quiz");
    expect(s0.phase).toBe("review");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: T0 });
    expect(s1.streak).toBe(5);
    // Score and total stay out of the review pass, as they always have.
    expect(s1.score).toBe(0);
    expect(s1.total).toBe(0);
    // Side effects unique to the Quiz review branch: the entry leaves the
    // queue, and no Study auto-grade is staged.
    expect(s1.retryQueue.some((e) => e.iso3 === "FRA")).toBe(false);
    expect(s1.autoGradePending).toBeNull();
  });

  it("breaks the run on a miss during a Quiz review pass", () => {
    // Review-phase answers do not move the score, but a run of correct
    // answers is a claim about recall — misses in review must break it, or
    // the next normal-phase answer could land on a threshold it did not earn.
    const s0 = withCurrent(
      { ...initialState(), phase: "review" as const, streak: 4 },
      "FRA",
    );
    expect(s0.practiceMode).toBe("quiz");
    expect(s0.phase).toBe("review");
    const s1 = reducer(s0, { type: "answer", iso3: "DEU", now: T0 });
    expect(s1.streak).toBe(0);
    // The Quiz review branch re-queues the miss; Study would stage an Again
    // instead, so this discriminates the branch as well as the outcome.
    expect(s1.autoGradePending).toBeNull();
  });

  it("ends a ceremony in flight when the learner leaves the session", () => {
    const s0 = studyAt("FRA", {
      milestone: { iso3: "FRA", name: "France", continentComplete: null },
      autoGradePending: "Good" as const,
      feedback: {
        kind: "correct" as const,
        answerIso3: "FRA",
        correctIso3: "FRA",
        at: 0,
      },
    });
    expect(reducer(s0, { type: "endSession" }).milestone).toBeNull();
    // startReview only transitions when there is something queued to review.
    const queued = { ...s0, retryQueue: [{ iso3: "DEU", dueAt: 0 }] };
    expect(reducer(queued, { type: "startReview" }).phase).toBe("review");
    expect(reducer(queued, { type: "startReview" }).milestone).toBeNull();
    expect(reducer(s0, { type: "closeSummary", now: T0 }).milestone).toBeNull();
    expect(reducer(s0, { type: "resetSrs" }).milestone).toBeNull();
    expect(
      reducer(s0, { type: "setContinents", continents: ["Africa"], now: T0 })
        .milestone,
    ).toBeNull();
  });

  it("cancels the grade behind a ceremony when progress is erased", () => {
    // Otherwise the flash timer commits against the emptied store and the
    // country the panel just announced as known lands back in learning.
    const s0 = studyAt("FRA", {
      milestone: { iso3: "FRA", name: "France", continentComplete: null },
      autoGradePending: "Good" as const,
      feedback: {
        kind: "correct" as const,
        answerIso3: "FRA",
        correctIso3: "FRA",
        at: 0,
      },
    });
    const s1 = reducer(s0, { type: "resetSrs" });
    expect(s1.autoGradePending).toBeNull();
    expect(s1.feedback).toBeNull();
  });

  it("drops a ceremony in flight when the learner starts a test", () => {
    const s0 = studyAt("FRA", {
      milestone: { iso3: "FRA", name: "France", continentComplete: null },
    });
    const s1 = reducer(s0, { type: "setPracticeMode", mode: "quiz" });
    expect(s1.milestone).toBeNull();
    expect(s1.streak).toBe(0);
  });
});

describe("reducer — counters (R2.4)", () => {
  const T0 = new Date("2026-05-16T12:00:00Z");

  it("counts a dismissed card", () => {
    const s0 = withCurrent(initialState({ practiceMode: "study" }), "FRA");
    const answered = reducer(s0, { type: "answer", iso3: "FRA", now: T0 });
    expect(answered.cardsAnswered).toBe(0); // not yet — the card is still up
    const dismissed = reducer(answered, { type: "dismiss", now: T0 });
    expect(dismissed.cardsAnswered).toBe(1);
  });

  it("counts an answer whose feedback Done closes, in Study", () => {
    // The grade still reaches the store, so the mode mix and the first-session
    // depth must not lose it.
    const s0 = withCurrent(initialState({ practiceMode: "study" }), "FRA");
    const answered = reducer(s0, { type: "answer", iso3: "FRA", now: T0 });
    expect(answered.autoGradePending).toBe("Good");
    const ended = reducer(answered, { type: "endSession" });
    expect(ended.cardsAnswered).toBe(1);
  });

  it("counts an answer whose feedback Done closes, in a test round", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const answered = reducer(s0, { type: "answer", iso3: "FRA", now: T0 });
    const ended = reducer(answered, { type: "endSession" });
    expect(ended.cardsAnswered).toBe(1);
  });

  it("counts nothing when Done is pressed with no feedback showing", () => {
    const s0 = withCurrent(initialState(), "FRA");
    expect(reducer(s0, { type: "endSession" }).cardsAnswered).toBe(0);
  });

  it("counts an answer whose feedback a scope change closes", () => {
    const s0 = withCurrent(initialState({ practiceMode: "study" }), "FRA");
    const answered = reducer(s0, { type: "answer", iso3: "FRA", now: T0 });
    const scoped = reducer(answered, {
      type: "setContinents",
      continents: ["Africa"],
      now: T0,
    });
    expect(scoped.cardsAnswered).toBe(1);
  });

  it("restarts the round when progress is erased", () => {
    // Otherwise the round in progress carries on to a finish the emptied
    // counters never saw begin, and the Data view reads "2 of 1".
    const s0 = {
      ...withCurrent(initialState({ practiceMode: "study" }), "FRA"),
      roundCards: 7,
      roundRight: 5,
      sittingCards: 19,
      cardsAnswered: 30,
    };
    const erased = reducer(s0, { type: "resetSrs" });
    expect(erased.roundCards).toBe(0);
    expect(erased.roundRight).toBe(0);
    expect(erased.cardsAnswered).toBe(0);
    expect(erased.sittingCards).toBe(0);
  });
});

describe("reducer — the Daily Expedition (R3.1)", () => {
  const POOL = expeditionPool(ALL_COUNTRIES);
  const DAY = "2026-09-06";
  const NOW = new Date(2026, 8, 6, 12, 0, 0);
  // A hand-picked ten so the assertions can name countries. Spans every
  // continent on purpose: the expedition ignores the continent filter.
  const TEN = ["FRA", "BRA", "JPN", "EGY", "AUS", "CAN", "IND", "ARG", "NGA", "DEU"];
  function store(outcomes: ExpeditionStore["outcomes"] = []): ExpeditionStore {
    return { version: 1, day: DAY, iso3s: TEN, outcomes };
  }
  function start(
    exp: ExpeditionStore = store(),
    base: State = initialState({
      practiceMode: "study",
      mode: "shape-to-name",
      selectedContinents: ["Europe"],
    }),
  ): State {
    return reducer(base, { type: "startExpedition", store: exp, now: NOW });
  }
  function answerAndDismiss(s: State, iso3: string): State {
    const answered = reducer(s, { type: "answer", iso3, now: NOW });
    return reducer(answered, { type: "dismiss", now: NOW });
  }

  it("starts on the first of the ten, in Name → Click, remembering the learner's mode", () => {
    const s = start();
    expect(s.practiceMode).toBe("expedition");
    expect(s.current.iso3).toBe("FRA");
    expect(s.mode).toBe("name-to-click");
    expect(s.modeBeforeExpedition).toBe("shape-to-name");
    expect(s.expedition).toEqual(store());
    expect(s.sessionDone).toBe(false);
    expect(s.roundCards).toBe(0);
  });

  it("uses the seeded ten for the day from the module", () => {
    const s = start(newExpedition(DAY, POOL));
    expect(s.expedition?.iso3s).toEqual(newExpedition(DAY, POOL).iso3s);
    expect(s.current.iso3).toBe(newExpedition(DAY, POOL).iso3s[0]);
  });

  it("a correct answer writes Good through at once and records a filled glyph", () => {
    const s = reducer(start(), { type: "answer", iso3: "FRA", now: NOW });
    expect(s.feedback?.kind).toBe("correct");
    expect(s.expedition?.outcomes).toEqual(["found"]);
    expect(s.srsStore.facts.location.FRA).toBeDefined();
    expect(s.srsStore.facts.location.FRA.hits).toBe(1);
    expect(s.streak).toBe(1);
    // A measurement, not a ceremony.
    expect(s.milestone).toBeNull();
  });

  it("a wrong answer and a skip both write Again and record an empty glyph", () => {
    const wrong = reducer(start(), { type: "answer", iso3: "DEU", now: NOW });
    expect(wrong.feedback).toEqual({
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
      at: NOW.getTime(),
    });
    expect(wrong.expedition?.outcomes).toEqual(["missed"]);
    expect(wrong.srsStore.facts.location.FRA.misses).toBe(1);
    // No test-round bookkeeping: there is no review pass to feed.
    expect(wrong.retryQueue).toEqual([]);
    expect(wrong.missed).toEqual([]);

    const skipped = reducer(start(), { type: "skip", now: NOW });
    expect(skipped.feedback?.kind).toBe("skipped");
    expect(skipped.expedition?.outcomes).toEqual(["missed"]);
    expect(skipped.srsStore.facts.location.FRA.misses).toBe(1);
  });

  it("writes to the store for a country outside the learner's continent filter", () => {
    // Scope is Europe; Brazil is the second card.
    const s = answerAndDismiss(start(), "FRA");
    expect(s.current.iso3).toBe("BRA");
    const t = reducer(s, { type: "answer", iso3: "BRA", now: NOW });
    expect(t.srsStore.facts.location.BRA).toBeDefined();
  });

  it("dismiss advances through the ten in order, counting the round", () => {
    let s = start();
    for (let i = 0; i < 3; i++) s = answerAndDismiss(s, TEN[i]);
    expect(s.current.iso3).toBe(TEN[3]);
    expect(s.roundCards).toBe(3);
    expect(s.roundRight).toBe(3);
    expect(s.cardsAnswered).toBe(3);
    expect(s.roundDone).toBe(false);
  });

  it("counts an answer when it is given, not when its reveal dismisses", () => {
    // So a reveal left open when the tab closes, or when "Done" leaves, is
    // still one answer in the mode it was given in.
    const s = reducer(start(), { type: "answer", iso3: "XXX", now: NOW });
    expect(s.cardsAnswered).toBe(1);
    expect(reducer(s, { type: "dismiss", now: NOW }).cardsAnswered).toBe(1);
    expect(reducer(s, { type: "endSession" }).cardsAnswered).toBe(1);
  });

  it("the tenth dismiss raises the result card and never the interstitial", () => {
    let s = start();
    for (let i = 0; i < EXPEDITION_SIZE - 1; i++) s = answerAndDismiss(s, TEN[i]);
    expect(s.sessionDone).toBe(false);
    s = answerAndDismiss(s, "XXX");
    expect(s.expedition?.outcomes).toHaveLength(EXPEDITION_SIZE);
    expect(s.expedition?.outcomes[9]).toBe("missed");
    expect(s.sessionDone).toBe(true);
    // The result card is the round break: never both.
    expect(s.roundDone).toBe(false);
    // The finished round was credited at the tenth answer, so the hook marks
    // the streak day and counts it even if the tab closes on this reveal.
    expect(s.roundsCompleted).toBe(1);
    expect(s.roundRight).toBe(9);
    expect(s.cardsAnswered).toBe(EXPEDITION_SIZE);
    // No eleventh card.
    expect(reducer(s, { type: "answer", iso3: "FRA", now: NOW })).toBe(s);
  });

  it("resumes a partial store at its index with the round counters caught up", () => {
    const s = start(store(["found", "missed", "found", "found"]));
    expect(s.current.iso3).toBe(TEN[4]);
    expect(s.roundCards).toBe(4);
    expect(s.roundRight).toBe(3);
    expect(s.sessionDone).toBe(false);
    // Six more finish it.
    let t = s;
    for (let i = 4; i < EXPEDITION_SIZE; i++) t = answerAndDismiss(t, TEN[i]);
    expect(t.sessionDone).toBe(true);
    expect(t.roundCards).toBe(EXPEDITION_SIZE);
    expect(t.roundsCompleted).toBe(1);
  });

  it("credits the finished round once, at the tenth answer, never on adoption or load", () => {
    let s = start();
    for (let i = 0; i < EXPEDITION_SIZE - 1; i++) s = answerAndDismiss(s, TEN[i]);
    const tenth = reducer(s, { type: "skip", now: NOW });
    expect(tenth.roundsCompleted).toBe(1);
    expect(reducer(tenth, { type: "dismiss", now: NOW }).roundsCompleted).toBe(1);
    // Loaded or adopted finished: no credit here — the tab that played it did.
    const done = store(Array(EXPEDITION_SIZE).fill("found"));
    expect(start(done).roundsCompleted).toBe(0);
    const study = initialState({ practiceMode: "study" });
    expect(
      reducer(study, { type: "syncExpedition", store: done }).roundsCompleted,
    ).toBe(0);
    const mid = answerAndDismiss(start(), "FRA");
    expect(reducer(mid, { type: "syncExpedition", store: done }).roundsCompleted).toBe(0);
  });

  it("a finished store opens straight onto its result, with no replay", () => {
    const done = store(Array(EXPEDITION_SIZE).fill("found"));
    const s = start(done);
    expect(s.sessionDone).toBe(true);
    expect(s.practiceMode).toBe("expedition");
    expect(reducer(s, { type: "answer", iso3: "FRA", now: NOW })).toBe(s);
    expect(reducer(s, { type: "reset" })).toBe(s);
  });

  it("locks the question mode while an expedition is up", () => {
    const s = start();
    expect(reducer(s, { type: "setMode", mode: "shape-to-name" })).toBe(s);
  });

  it("keeps the current card across a scope change", () => {
    const s = answerAndDismiss(start(), "FRA");
    expect(s.current.iso3).toBe("BRA");
    const t = reducer(s, {
      type: "setContinents",
      continents: ["Asia"],
      now: NOW,
    });
    expect(t.current.iso3).toBe("BRA");
    expect(t.selectedContinents).toEqual(["Asia"]);
    expect(t.practiceMode).toBe("expedition");
  });

  it("Done leaves to studying, restores the mode and keeps the store", () => {
    const s = reducer(answerAndDismiss(start(), "FRA"), {
      type: "answer",
      iso3: "XXX",
      now: NOW,
    });
    const t = reducer(s, { type: "endSession" });
    expect(t.practiceMode).toBe("study");
    expect(t.mode).toBe("shape-to-name");
    expect(t.modeBeforeExpedition).toBeNull();
    expect(t.sessionDone).toBe(false);
    expect(t.feedback).toBeNull();
    // The answer whose reveal was open was counted when it was given: its
    // grade is in the store and its glyph in the expedition.
    expect(t.expedition?.outcomes).toEqual(["found", "missed"]);
    expect(t.cardsAnswered).toBe(2);
    // Resuming picks up at the third card.
    expect(start(t.expedition!, t).current.iso3).toBe("JPN");
  });

  it("Done on the tenth card's reveal finishes the expedition instead of leaving it", () => {
    let s = start();
    for (let i = 0; i < EXPEDITION_SIZE - 1; i++) s = answerAndDismiss(s, TEN[i]);
    s = reducer(s, { type: "skip", now: NOW });
    expect(s.expedition?.outcomes).toHaveLength(EXPEDITION_SIZE);
    const t = reducer(s, { type: "endSession" });
    expect(t.practiceMode).toBe("expedition");
    expect(t.sessionDone).toBe(true);
    expect(t.roundCards).toBe(EXPEDITION_SIZE);
    expect(t.cardsAnswered).toBe(EXPEDITION_SIZE);
    expect(t.roundsCompleted).toBe(1);
  });

  it("closing the result card leaves to studying", () => {
    const s = start(store(Array(EXPEDITION_SIZE).fill("missed")));
    const t = reducer(s, { type: "closeSummary", now: NOW });
    expect(t.practiceMode).toBe("study");
    expect(t.sessionDone).toBe(false);
    expect(t.expedition?.outcomes).toHaveLength(EXPEDITION_SIZE);
  });

  it("erasing all progress drops the expedition and leaves it", () => {
    const s = answerAndDismiss(start(), "FRA");
    const t = reducer(s, { type: "resetSrs" });
    expect(t.expedition).toBeNull();
    expect(t.practiceMode).toBe("study");
    expect(t.srsStore.facts.location).toEqual({});
  });

  it("carries the store through a question-mode flip outside an expedition", () => {
    const s = reducer(start(store(["found"])), { type: "endSession" });
    const t = reducer(s, { type: "setMode", mode: "name-to-click" });
    expect(t.expedition).toEqual(store(["found"]));
  });

  it("adopts another tab's store when it is further along, mid-run", () => {
    // This tab is on the second card with the first's reveal open; the other
    // tab has answered three.
    const s = reducer(answerAndDismiss(start(), "FRA"), {
      type: "skip",
      now: NOW,
    });
    const ahead = store(["found", "missed", "found"]);
    const t = reducer(s, { type: "syncExpedition", store: ahead });
    expect(t.expedition).toBe(ahead);
    expect(t.current.iso3).toBe(TEN[3]);
    expect(t.feedback).toBeNull();
    expect(t.roundCards).toBe(3);
    expect(t.roundRight).toBe(2);
    expect(t.sessionDone).toBe(false);
    // Finished elsewhere: the result card, as the tenth dismiss would give.
    const done = store(Array(EXPEDITION_SIZE).fill("missed"));
    const u = reducer(s, { type: "syncExpedition", store: done });
    expect(u.sessionDone).toBe(true);
    expect(u.roundDone).toBe(false);
    expect(u.roundCards).toBe(EXPEDITION_SIZE);
  });

  it("ignores another tab's store that is no further along", () => {
    const s = answerAndDismiss(answerAndDismiss(start(), "FRA"), "BRA");
    expect(reducer(s, { type: "syncExpedition", store: store(["missed"]) })).toBe(s);
    expect(
      reducer(s, { type: "syncExpedition", store: store(["missed", "missed"]) }),
    ).toBe(s);
  });

  it("ignores a later day's store while a run or its result is on screen", () => {
    // Another tab opened tomorrow's past midnight. This tab's run stands;
    // the door reads today afresh once the learner leaves.
    const tomorrow: ExpeditionStore = { ...store(), day: "2026-09-07" };
    const mid = answerAndDismiss(start(), "FRA");
    expect(reducer(mid, { type: "syncExpedition", store: tomorrow })).toBe(mid);
    const shown = start(store(Array(EXPEDITION_SIZE).fill("missed")));
    expect(reducer(shown, { type: "syncExpedition", store: tomorrow })).toBe(shown);
    // Outside a run it is simply tomorrow's store.
    const study = initialState({ practiceMode: "study", expedition: store(["found"]) });
    expect(
      reducer(study, { type: "syncExpedition", store: tomorrow }).expedition,
    ).toBe(tomorrow);
  });

  it("drops the store when another tab erased it, leaving a run in progress", () => {
    const mid = reducer(answerAndDismiss(start(), "FRA"), {
      type: "answer",
      iso3: "XXX",
      now: NOW,
    });
    const t = reducer(mid, { type: "syncExpedition", store: null, now: NOW });
    expect(t.expedition).toBeNull();
    expect(t.practiceMode).toBe("study");
    expect(t.mode).toBe("shape-to-name");
    expect(t.feedback).toBeNull();
    const study = initialState({ practiceMode: "study", expedition: store(["found"]) });
    expect(reducer(study, { type: "syncExpedition", store: null }).expedition).toBeNull();
    // Nothing to drop: the same state back.
    const none = initialState({ practiceMode: "study" });
    expect(reducer(none, { type: "syncExpedition", store: null })).toBe(none);
  });

  it("is a no-op when dispatched inside a run", () => {
    const mid = answerAndDismiss(start(), "FRA");
    expect(reducer(mid, { type: "startExpedition", store: store(), now: NOW })).toBe(mid);
  });

  it("adopts another tab's store outside a run without touching the card", () => {
    const study = initialState({ practiceMode: "study" });
    const ahead = store(["found"]);
    const t = reducer(study, { type: "syncExpedition", store: ahead });
    expect(t.expedition).toBe(ahead);
    expect(t.practiceMode).toBe("study");
    expect(t.current).toBe(study.current);
  });

  it("commits a Study grade in flight when the expedition starts", () => {
    const study = withCurrent(initialState({ practiceMode: "study" }), "FRA");
    const missed = reducer(study, { type: "skip", now: NOW });
    expect(missed.autoGradePending).toBe("Again");
    const s = start(store(), missed);
    expect(s.srsStore.facts.location.FRA.misses).toBe(1);
    expect(s.autoGradePending).toBeNull();
    // That grade reached the store, so the answer is counted, as every
    // other in-flight commit counts it.
    expect(s.cardsAnswered).toBe(missed.cardsAnswered + 1);
  });

  describe("a second look at the misses (#64)", () => {
    // JPN and IND missed; the rest found.
    const OUTCOMES: ExpeditionStore["outcomes"] = [
      "found", "found", "missed", "found", "found",
      "found", "missed", "found", "found", "found",
    ];
    function reviewing(): State {
      return reducer(start(store(OUTCOMES)), { type: "startReview" });
    }

    it("asks the misses in order, from the result card", () => {
      const result = start(store(OUTCOMES));
      expect(result.sessionDone).toBe(true);
      const s = reducer(result, { type: "startReview" });
      expect(s.phase).toBe("review");
      expect(s.sessionDone).toBe(false);
      expect(s.current.iso3).toBe("JPN");
      expect(s.retryQueue.map((e) => e.iso3)).toEqual(["JPN", "IND"]);
      expect(s.practiceMode).toBe("expedition");
    });

    it("is not offered by an unfinished or a clean expedition", () => {
      const midway = start(store(["found"]));
      expect(reducer(midway, { type: "startReview" })).toBe(midway);
      const clean = start(store(OUTCOMES.map(() => "found")));
      expect(reducer(clean, { type: "startReview" })).toBe(clean);
    });

    it("never changes the result, writes no grade and counts the answers", () => {
      const s0 = reviewing();
      let s = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
      expect(s.feedback?.kind).toBe("wrong");
      expect(s.srsStore).toBe(s0.srsStore);
      s = reducer(s, { type: "dismiss", now: NOW });
      expect(s.cardsAnswered).toBe(s0.cardsAnswered + 1);
      // A miss comes back after the others, until it is found.
      expect(s.current.iso3).toBe("IND");
      s = answerAndDismiss(s, "IND");
      expect(s.current.iso3).toBe("JPN");
      expect(s.roundDone).toBe(false);
      s = answerAndDismiss(s, "JPN");
      // Back on the result card, exactly as it was.
      expect(s.sessionDone).toBe(true);
      expect(s.phase).toBe("normal");
      expect(s.expedition).toBe(s0.expedition);
      expect(s.srsStore).toBe(s0.srsStore);
      expect(s.roundsCompleted).toBe(s0.roundsCompleted);
      expect(s.cardsAnswered).toBe(s0.cardsAnswered + 3);
      // The card knows the look ran to its end, until a new look or leaving.
      expect(s.expeditionLookDone).toBe(true);
      expect(reducer(s, { type: "startReview" }).expeditionLookDone).toBe(false);
      expect(
        reducer(s, { type: "setPracticeMode", mode: "study", now: NOW })
          .expeditionLookDone,
      ).toBe(false);
    });

    it("Done goes back to the result, counting an open reveal", () => {
      const s0 = reviewing();
      const answered = reducer(s0, { type: "answer", iso3: "JPN", now: NOW });
      const s = reducer(answered, { type: "endSession" });
      expect(s.practiceMode).toBe("expedition");
      expect(s.sessionDone).toBe(true);
      expect(s.phase).toBe("normal");
      expect(s.retryQueue).toEqual([]);
      expect(s.feedback).toBeNull();
      expect(s.cardsAnswered).toBe(s0.cardsAnswered + 1);
      // Left part-way, so the look is not done.
      expect(s.expeditionLookDone).toBe(false);
    });

    it("keeps its queue across a scope change, and leaves it behind on the way out", () => {
      const s = reducer(reviewing(), {
        type: "setContinents",
        continents: ["Europe"],
      });
      expect(s.retryQueue.map((e) => e.iso3)).toEqual(["JPN", "IND"]);
      const left = reducer(s, { type: "setPracticeMode", mode: "study", now: NOW });
      expect(left.retryQueue).toEqual([]);
      expect(left.phase).toBe("normal");
    });
  });
});

// ── R3.2: a record per fact, and the capital modes ───────────────────────────

describe("reducer — capital modes (R3.2)", () => {
  const NOW = new Date("2026-09-12T12:00:00Z");

  // A real country, so the capital matcher and the pool have something to
  // work with. PER's capital is Lima and it has five land neighbours.
  function capitalState(
    practiceMode: State["practiceMode"] = "study",
    mode: State["mode"] = "country-to-capital",
  ): State {
    const s = initialState({ mode, practiceMode });
    const peru = ALL_COUNTRIES.find((c) => c.iso3 === "PER")!;
    return { ...s, current: peru };
  }

  describe("grading writes to the fact that was asked", () => {
    it("a Study capital answer grades only facts.capital", () => {
      const s = capitalState();
      const answered = reducer(s, { type: "answer", iso3: "PER", now: NOW });
      const committed = reducer(answered, { type: "dismiss", now: NOW });
      expect(committed.srsStore.facts.capital.PER).toBeDefined();
      // Knowing Lima says nothing about being able to find Peru.
      expect(committed.srsStore.facts.location.PER).toBeUndefined();
    });

    it("a test round's capital answer writes through to facts.capital", () => {
      const s = capitalState("quiz");
      const answered = reducer(s, { type: "answer", iso3: "PER", now: NOW });
      expect(answered.srsStore.facts.capital.PER.hits).toBe(1);
      expect(answered.srsStore.facts.location.PER).toBeUndefined();
    });

    it("leaves the other fact's records untouched by object identity", () => {
      // A memo keyed on facts.location must not re-run after a capital answer.
      const seeded: State = {
        ...capitalState("quiz"),
        srsStore: storeWith({ FRA: srsGrade(null, "Good", NOW) }),
      };
      const answered = reducer(seeded, { type: "answer", iso3: "PER", now: NOW });
      expect(answered.srsStore.facts.location).toBe(
        seeded.srsStore.facts.location,
      );
    });
  });

  describe("the pool", () => {
    it("leaves out countries with no capital, even with territories on", () => {
      // Without this a capital test round with territories on could never
      // finish: Antarctica and the French Southern Territories would sit in
      // the pool forever with nothing to ask about them.
      const s = initialState({
        mode: "capital-to-click",
        practiceMode: "quiz",
        includeTerritories: true,
      });
      const seen = new Set<string>();
      let cur: State = s;
      for (let i = 0; i < 2000; i++) {
        if (cur.sessionDone) break;
        if (cur.roundDone) {
          cur = reducer(cur, { type: "continueRound", now: NOW });
          continue;
        }
        seen.add(cur.current.iso3);
        cur = reducer(cur, { type: "answer", iso3: cur.current.iso3, now: NOW });
        cur = reducer(cur, { type: "dismiss", now: NOW });
      }
      expect(cur.sessionDone).toBe(true);
      expect(seen.has("ATA")).toBe(false);
      expect(seen.has("ATF")).toBe(false);
    });
  });

  describe("ceremony", () => {
    // One Good puts a card in learning; the next, once the learning step has
    // elapsed, graduates it to Review — the crossing the ceremony marks.
    const SEEDED = new Date("2026-09-12T11:00:00Z");
    const almostKnown = () => srsGrade(null, "Good", SEEDED);

    it("sets no milestone in a capital mode, but still builds the streak", () => {
      // "Now on your map" and the hatch are map ceremonies, and the map
      // paints locations. A run of correct answers still means something.
      const seeded: State = {
        ...capitalState(),
        streak: 4,
        srsStore: storeWith({ PER: almostKnown() }, "capital"),
      };
      const answered = reducer(seeded, { type: "answer", iso3: "PER", now: NOW });
      expect(answered.milestone).toBeNull();
      expect(answered.streak).toBe(5);
    });

    it("still sets one in a location mode", () => {
      const s = initialState({ mode: "name-to-click", practiceMode: "study" });
      const peru = ALL_COUNTRIES.find((c) => c.iso3 === "PER")!;
      const seeded: State = {
        ...s,
        current: peru,
        srsStore: storeWith({ PER: almostKnown() }),
      };
      const answered = reducer(seeded, { type: "answer", iso3: "PER", now: NOW });
      expect(answered.milestone?.iso3).toBe("PER");
    });
  });
});

describe("reducer — enterQuestionMode (R3.2)", () => {
  const NOW = new Date("2026-09-12T12:00:00Z");

  function studyAt(iso3: string, patch: Partial<State> = {}): State {
    return {
      ...withCurrent(initialState({ practiceMode: "study" }), iso3),
      ...patch,
    };
  }

  it("keeps the Study miss queue and the new-card cap between two location modes", () => {
    // Both modes ask about the same fact, so the cards those refer to are
    // still the cards in front of the learner.
    const s = studyAt("FRA", {
      studyResurfaceQueue: [{ iso3: "DEU", dueAt: 3 }],
      studyStep: 2,
      newIntroducedThisStretch: 4,
    });
    const next = reducer(s, { type: "setMode", mode: "shape-to-name", now: NOW });
    expect(next.studyResurfaceQueue).toEqual([{ iso3: "DEU", dueAt: 3 }]);
    expect(next.studyStep).toBe(2);
    expect(next.newIntroducedThisStretch).toBe(4);
  });

  it("resets them when the fact changes", () => {
    // They refer to the other fact's cards; carrying them over would
    // resurface a location miss as a capital prompt.
    const s = studyAt("FRA", {
      studyResurfaceQueue: [{ iso3: "DEU", dueAt: 3 }],
      studyStep: 2,
      newIntroducedThisStretch: 4,
    });
    const next = reducer(s, {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    expect(next.studyResurfaceQueue).toEqual([]);
    expect(next.studyStep).toBe(0);
    expect(next.newIntroducedThisStretch).toBe(0);
  });

  it("carries a Study round across the switch", () => {
    // The learner is still in the same sitting; a new round here would
    // inflate roundsStarted every time they tried another prompt.
    const s = studyAt("FRA", { roundCards: 5, roundRight: 4, roundNew: 2 });
    const next = reducer(s, { type: "setMode", mode: "shape-to-name", now: NOW });
    expect(next.roundCards).toBe(5);
    expect(next.roundRight).toBe(4);
    expect(next.roundNew).toBe(2);
  });

  it("restarts a test round, whose queue refers to the old question type", () => {
    const s = withCurrent(initialState({ practiceMode: "quiz" }), "FRA");
    const seeded: State = {
      ...s,
      score: 5,
      total: 8,
      roundCards: 5,
      retryQueue: [{ iso3: "DEU", dueAt: 9 }],
      completedSet: new Set(["ESP"]),
      missed: [s.current],
      missedSet: new Set(["FRA"]),
    };
    const next = reducer(seeded, {
      type: "setMode",
      mode: "shape-to-name",
      now: NOW,
    });
    expect(next.retryQueue).toEqual([]);
    expect(next.completedSet.size).toBe(0);
    expect(next.score).toBe(0);
    expect(next.total).toBe(0);
    expect(next.missed).toEqual([]);
    expect(next.roundCards).toBe(0);
  });

  it("commits a deferred Study grade before the mode moves", () => {
    // The miss was given in the old mode and belongs to its fact.
    const s = studyAt("FRA");
    const missed = reducer(s, { type: "skip", now: NOW });
    expect(missed.autoGradePending).toBe("Again");

    const next = reducer(missed, {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    expect(next.srsStore.facts.location.FRA.misses).toBe(1);
    expect(next.srsStore.facts.capital.FRA).toBeUndefined();
    expect(next.autoGradePending).toBeNull();
    expect(next.feedback).toBeNull();
  });

  it("keeps cardsAnswered and roundsCompleted, which only ever grow", () => {
    const s = studyAt("FRA", { cardsAnswered: 17, roundsCompleted: 2 });
    const next = reducer(s, { type: "setMode", mode: "shape-to-name", now: NOW });
    expect(next.cardsAnswered).toBe(17);
    expect(next.roundsCompleted).toBe(2);
  });

  it("does not rewrite the continent selection", () => {
    const s = studyAt("FRA", { selectedContinents: ["Africa"] });
    const next = reducer(s, {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    expect(next.selectedContinents).toEqual(["Africa"]);
  });

  it("breaks a run of correct answers", () => {
    const s = studyAt("FRA", { streak: 7 });
    const next = reducer(s, { type: "setMode", mode: "shape-to-name", now: NOW });
    expect(next.streak).toBe(0);
  });

  it("is ignored during an expedition", () => {
    const pool = expeditionPool(ALL_COUNTRIES);
    const store = newExpedition("2026-09-12", pool);
    const started = reducer(initialState({ practiceMode: "study" }), {
      type: "startExpedition",
      store,
      now: NOW,
    });
    const next = reducer(started, {
      type: "setMode",
      mode: "shape-to-name",
      now: NOW,
    });
    expect(next).toBe(started);
  });
});

describe("reducer — an expedition started from a capital mode (R3.2)", () => {
  const NOW = new Date("2026-09-12T12:00:00Z");
  const DAY = "2026-09-12";

  function started(): State {
    const s = initialState({
      mode: "country-to-capital",
      practiceMode: "study",
    });
    const store = newExpedition(DAY, expeditionPool(ALL_COUNTRIES));
    return reducer(s, { type: "startExpedition", store, now: NOW });
  }

  it("grades location, because an expedition is always Name → Click", () => {
    const s = started();
    expect(s.mode).toBe("name-to-click");
    const answered = reducer(s, {
      type: "answer",
      iso3: s.current.iso3,
      now: NOW,
    });
    expect(answered.srsStore.facts.location[s.current.iso3]).toBeDefined();
    expect(answered.srsStore.facts.capital[s.current.iso3]).toBeUndefined();
  });

  it("keeps the learner's own fact for everything the settings display", () => {
    // The answer fact and the learner fact differ only here. The settings
    // must keep showing capitals to someone who is studying capitals.
    const s = started();
    expect(learnerFact(s)).toBe("capital");
    expect(answerFact(s)).toBe("location");
  });

  it("restores the capital mode on the way out", () => {
    const left = reducer(started(), { type: "endSession" });
    expect(left.mode).toBe("country-to-capital");
    expect(left.modeBeforeExpedition).toBeNull();
    expect(learnerFact(left)).toBe("capital");
  });

  it("never leaves a capitals learner with an empty pool after a scope change", () => {
    // Scope is normalised against the fact the learner RETURNS to, so a
    // change made mid-expedition cannot strand them.
    const s = started();
    const narrowed = reducer(s, {
      type: "setContinents",
      continents: ["Antarctica"],
      now: NOW,
    });
    // Antarctica holds nothing with a capital, so the selection falls back.
    expect(narrowed.selectedContinents).toEqual(ALL_CONTINENTS);
    const left = reducer(narrowed, { type: "endSession" });
    expect(
      filterPool(left.selectedContinents, left.includeTerritories, "capital")
        .length,
    ).toBeGreaterThan(0);
  });
});

describe("reducer — a question mode that cannot be asked (R3.2)", () => {
  const NOW = new Date("2026-09-12T12:00:00Z");

  it("refuses the switch rather than widening the scope or crashing", () => {
    // Antarctica's two rows have no capital. The settings disable the option,
    // but the reducer must not lean on a UI guard: an empty pool makes Quiz's
    // pickRandom throw and leaves Study on a card with a blank prompt.
    const s = initialState({
      mode: "name-to-click",
      practiceMode: "quiz",
      selectedContinents: ["Antarctica"],
      includeTerritories: true,
    });
    const next = reducer(s, {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    expect(next).toBe(s);
    // And the learner's selection is left exactly as they set it.
    expect(next.selectedContinents).toEqual(["Antarctica"]);
  });

  it("allows it as soon as one selected continent can be asked", () => {
    const s = initialState({
      mode: "name-to-click",
      practiceMode: "study",
      selectedContinents: ["Antarctica", "Europe"],
      includeTerritories: true,
    });
    const next = reducer(s, {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    expect(next.mode).toBe("country-to-capital");
    expect(next.current.capital).not.toBeNull();
  });
});

describe("reducer — a card answered on the way out of a round", () => {
  const NOW = new Date("2026-09-12T12:00:00Z");

  // Five cards answered and dismissed cleanly, then a sixth answered with its
  // feedback still on screen. Both paths below close that feedback without
  // going through dismissFeedback, and both keep the round running — so the
  // sixth card has to land in it, or twelve cards take thirteen answers.
  function sixthAnswerPending(kind: "correct" | "wrong"): State {
    let s: State = initialState({
      mode: "name-to-click",
      practiceMode: "study",
    });
    for (let i = 0; i < 5; i++) {
      s = reducer(s, { type: "answer", iso3: s.current.iso3, now: NOW });
      s = reducer(s, { type: "dismiss", now: NOW });
    }
    expect(s.roundCards).toBe(5);
    return reducer(s, {
      type: "answer",
      iso3: kind === "correct" ? s.current.iso3 : "ZZZ",
      now: NOW,
    });
  }

  it("counts it into the round when the question mode changes", () => {
    const pending = sixthAnswerPending("correct");
    const next = reducer(pending, {
      type: "setMode",
      mode: "shape-to-name",
      now: NOW,
    });
    expect(next.roundCards).toBe(6);
    expect(next.roundRight).toBe(6);
    // The hook books this answer against the old mode itself, so the reducer
    // must NOT also bump cardsAnswered or it is counted twice.
    expect(next.cardsAnswered).toBe(pending.cardsAnswered);
  });

  it("counts a miss into the round, without crediting it as right", () => {
    const pending = sixthAnswerPending("wrong");
    const next = reducer(pending, {
      type: "setMode",
      mode: "shape-to-name",
      now: NOW,
    });
    expect(next.roundCards).toBe(6);
    expect(next.roundRight).toBe(5);
  });

  it("counts it into the round when the scope changes", () => {
    const pending = sixthAnswerPending("correct");
    const next = reducer(pending, {
      type: "setContinents",
      continents: ["Europe", "Africa", "Asia"],
      now: NOW,
    });
    expect(next.roundCards).toBe(6);
    expect(next.roundRight).toBe(6);
    // A scope change counts the answer itself — nothing else does it there.
    expect(next.cardsAnswered).toBe(pending.cardsAnswered + 1);
  });

  it("still commits the grade it closed", () => {
    const pending = sixthAnswerPending("correct");
    const iso3 = pending.current.iso3;
    expect(pending.autoGradePending).toBe("Good");
    const next = reducer(pending, {
      type: "setMode",
      mode: "shape-to-name",
      now: NOW,
    });
    expect(next.srsStore.facts.location[iso3]).toBeDefined();
    expect(next.autoGradePending).toBeNull();
  });

  it("leaves the round alone when no card was open", () => {
    let s: State = initialState({
      mode: "name-to-click",
      practiceMode: "study",
    });
    s = reducer(s, { type: "answer", iso3: s.current.iso3, now: NOW });
    s = reducer(s, { type: "dismiss", now: NOW });
    const next = reducer(s, {
      type: "setMode",
      mode: "shape-to-name",
      now: NOW,
    });
    expect(next.roundCards).toBe(1);
    expect(next.cardsAnswered).toBe(s.cardsAnswered);
  });
});

describe("reducer — the capitals offer is what the scheduler serves (R3.2)", () => {
  const NOW = new Date("2026-09-12T12:00:00Z");

  function knownRecordAt(): SrsRecord {
    return { ...srsGrade(null, "Good", NOW), state: 2 };
  }

  function learnerKnowing(iso3s: string[]): State {
    const s = initialState({
      mode: "name-to-click",
      practiceMode: "study",
      selectedContinents: ["South America"],
    });
    const location: Record<string, SrsRecord> = {};
    for (const iso3 of iso3s) location[iso3] = knownRecordAt();
    return { ...s, srsStore: storeWith(location) };
  }

  function serve(state: State, n: number): string[] {
    let t = state;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      out.push(t.current.iso3);
      t = reducer(t, { type: "answer", iso3: t.current.iso3, now: NOW });
      t = reducer(t, { type: "dismiss", now: NOW });
    }
    return out;
  }

  it("asks about the countries the door promised, before any other", () => {
    // The door says "2 countries you already know". Without the prerequisite
    // the scheduler introduced by notability and served Brazil and Argentina
    // first, so the offer was a lie.
    const s = learnerKnowing(["PER", "CHL"]);
    const entered = reducer(s, {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    expect(serve(entered, 2).sort()).toEqual(["CHL", "PER"]);
  });

  it("carries on past them rather than running dry", () => {
    // A learner who picks a capital mode from the settings with nothing
    // placed yet must still have something to answer.
    const none = reducer(learnerKnowing([]), {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    expect(none.current.capital).not.toBeNull();

    const some = reducer(learnerKnowing(["PER"]), {
      type: "setMode",
      mode: "country-to-capital",
      now: NOW,
    });
    const served = serve(some, 3);
    expect(served[0]).toBe("PER");
    expect(served).toHaveLength(3);
  });

  it("leaves the location fact's introduction order alone", () => {
    // Locations have no prerequisite, so the ordinary order still decides:
    // notability, then size, then iso3. Computed rather than hard-coded, so
    // this pins the rule and not a particular row of the country table.
    const inScope = ALL_COUNTRIES.filter(
      (c) => c.continent === "South America" && !c.territory,
    );
    const expected = [...inScope].sort(
      (a, b) =>
        introductionOrder(b) - introductionOrder(a) ||
        a.iso3.localeCompare(b.iso3),
    )[0].iso3;
    expect(serve(learnerKnowing([]), 1)[0]).toBe(expected);
  });
});

describe("cardIsReturning", () => {
  const NOW = new Date("2026-09-13T12:00:00Z");

  function studyWithRecord(): State {
    const s = initialState({ practiceMode: "study" });
    return {
      ...s,
      srsStore: storeWith({ [s.current.iso3]: srsGrade(null, "Good", NOW) }),
    };
  }

  it("is false for a Study card with no record", () => {
    expect(cardIsReturning(initialState({ practiceMode: "study" }))).toBe(false);
  });

  it("is true for a Study card that has a record for the fact asked", () => {
    expect(cardIsReturning(studyWithRecord())).toBe(true);
  });

  it("reads the fact being asked, not another fact's record", () => {
    const s = studyWithRecord();
    expect(cardIsReturning({ ...s, mode: "country-to-capital" })).toBe(false);
  });

  it("is false outside Study, whatever the store holds", () => {
    const s = studyWithRecord();
    expect(cardIsReturning({ ...s, practiceMode: "quiz" })).toBe(false);
    expect(cardIsReturning({ ...s, practiceMode: "expedition" })).toBe(false);
  });
});
