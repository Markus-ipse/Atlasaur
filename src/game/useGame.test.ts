import { describe, it, expect } from "vitest";
import { reducer, initialState, type State } from "./useGame";
import { ALL_CONTINENTS, type Country } from "../types";

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
    });
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

  it("review: correct answer is ungraded — score/streak/total/missed unchanged", () => {
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
    expect(after.streak).toBe(baseline.streak);
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
      initialState("name-to-click", ["Antarctica"]),
      "ATA",
    );
    const seeded: State = {
      ...s0,
      completedSet: new Set(["ATA", "ATF"]),
      retryQueue: [],
      feedback: { kind: "correct", answerIso3: "ATA", correctIso3: "ATA" },
    };
    const result = reducer(seeded, { type: "dismiss" });
    expect(result.sessionDone).toBe(true);
    expect(result.feedback).toBeNull();
  });

  it("dismiss does not flip sessionDone while retryQueue is non-empty", () => {
    const s0 = withCurrent(
      initialState("name-to-click", ["Antarctica"]),
      "ATA",
    );
    const seeded: State = {
      ...s0,
      completedSet: new Set(["ATA"]),
      retryQueue: [{ iso3: "ATF", dueAt: 1 }],
      feedback: { kind: "correct", answerIso3: "ATA", correctIso3: "ATA" },
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
        initialState("name-to-click", ALL_CONTINENTS),
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
      feedback: { kind: "wrong", answerIso3: "DEU", correctIso3: "FRA" },
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

describe("reducer — SRS write-through (Exam normal phase)", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("answer-correct in Exam writes a Good grade to srsStore", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
    expect(s1.srsStore.records["FRA"]).toBeDefined();
    expect(s1.srsStore.records["FRA"].reps).toBe(1);
  });

  it("answer-wrong in Exam writes an Again grade to srsStore", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "DEU", now: NOW });
    expect(s1.srsStore.records["FRA"]).toBeDefined();
    expect(s1.srsStore.records["FRA"].reps).toBe(1);
  });

  it("skip in Exam writes an Again grade", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "skip", now: NOW });
    expect(s1.srsStore.records["FRA"]).toBeDefined();
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
    expect(s1.srsStore.records["FRA"]).toBeUndefined();
  });
});

describe("reducer — setPracticeMode", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("flips to Training and resets session counters", () => {
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
      mode: "training",
      now: NOW,
    });
    expect(next.practiceMode).toBe("training");
    expect(next.score).toBe(0);
    expect(next.streak).toBe(0);
    expect(next.total).toBe(0);
    expect(next.missed).toHaveLength(0);
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
      mode: "training",
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
      mode: "training",
      now: NOW,
    });
    expect(next.srsStore.records["FRA"]).toEqual(s1.srsStore.records["FRA"]);
  });
});

describe("reducer — Training mode grade flow", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  function trainingState(): State {
    return withCurrent(
      { ...initialState(), practiceMode: "training" as const },
      "FRA",
    );
  }

  it("answer-wrong sets pendingGrade and shows feedback (no auto-grade)", () => {
    const s0 = trainingState();
    const s1 = reducer(s0, { type: "answer", iso3: "DEU", now: NOW });
    expect(s1.feedback?.kind).toBe("wrong");
    expect(s1.pendingGrade).toBe(true);
    expect(s1.srsStore.records["FRA"]).toBeUndefined();
  });

  it("grade(Good) after a wrong answer writes Good and clears pendingGrade", () => {
    let s = trainingState();
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    s = reducer(s, { type: "grade", ease: "Good", now: NOW });
    expect(s.pendingGrade).toBe(false);
    expect(s.srsStore.records["FRA"]).toBeDefined();
    expect(s.srsStore.records["FRA"].reps).toBe(1);
    expect(s.feedback).toBeNull();
  });

  it("answer-correct in Training defers auto-Good until dismiss", () => {
    const s0 = trainingState();
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
    expect(s1.pendingGrade).toBe(false);
    expect(s1.autoGradePending).toBe("Good");
    expect(s1.srsStore.records["FRA"]).toBeUndefined();
    expect(s1.feedback?.kind).toBe("correct");

    const s2 = reducer(s1, { type: "dismiss", now: NOW });
    expect(s2.srsStore.records["FRA"]).toBeDefined();
    expect(s2.autoGradePending).toBeNull();
  });

  it("override after correct uses the user's ease, not Good-then-ease", () => {
    let s = trainingState();
    s = reducer(s, { type: "answer", iso3: "FRA", now: NOW });
    expect(s.autoGradePending).toBe("Good");
    // User overrides with Easy while feedback is showing.
    s = reducer(s, { type: "grade", ease: "Easy", now: NOW });
    const overridden = s.srsStore.records["FRA"];
    expect(overridden).toBeDefined();
    expect(overridden.reps).toBe(1); // single grade, not two
    expect(s.autoGradePending).toBeNull();
    // Compare against a single-Easy baseline on a fresh card.
    const baseline = trainingState();
    const baselineSingleEasy = reducer(baseline, {
      type: "grade",
      ease: "Easy",
      now: NOW,
    });
    expect(overridden).toEqual(baselineSingleEasy.srsStore.records["FRA"]);
  });

  it("skip in Training defers auto-Again until dismiss", () => {
    const s0 = trainingState();
    const s1 = reducer(s0, { type: "skip", now: NOW });
    expect(s1.pendingGrade).toBe(false);
    expect(s1.autoGradePending).toBe("Again");
    expect(s1.srsStore.records["FRA"]).toBeUndefined();
    expect(s1.feedback?.kind).toBe("skipped");

    const s2 = reducer(s1, { type: "dismiss", now: NOW });
    expect(s2.srsStore.records["FRA"]).toBeDefined();
    expect(s2.autoGradePending).toBeNull();
  });

  it("dismiss after a wrong with pendingGrade defaults to Again", () => {
    let s = trainingState();
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s.pendingGrade).toBe(true);
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.pendingGrade).toBe(false);
    expect(s.srsStore.records["FRA"]).toBeDefined();
    expect(s.feedback).toBeNull();
  });

  it("increments newIntroducedThisStretch only on first-time grades", () => {
    let s = trainingState();
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

  it("introduction count rises when a wrong-then-grade creates a new record", () => {
    let s = trainingState();
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s.pendingGrade).toBe(true);
    expect(s.newIntroducedThisStretch).toBe(0);
    s = reducer(s, { type: "grade", ease: "Again", now: NOW });
    expect(s.newIntroducedThisStretch).toBe(1);
  });
});

describe("reducer — resetSrs / closeSummary", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("resetSrs empties the store but preserves practiceMode and continents", () => {
    let s = withCurrent(initialState(), "FRA");
    s = reducer(s, { type: "answer", iso3: "FRA", now: NOW });
    expect(Object.keys(s.srsStore.records)).toHaveLength(1);
    const next = reducer(s, { type: "resetSrs" });
    expect(next.srsStore.records).toEqual({});
    expect(next.practiceMode).toBe(s.practiceMode);
    expect(next.selectedContinents).toBe(s.selectedContinents);
  });

  it("closeSummary clears sessionDone without nuking session state", () => {
    let s = withCurrent(initialState(), "FRA");
    s = { ...s, sessionDone: true, score: 7 };
    const next = reducer(s, { type: "closeSummary", now: NOW });
    expect(next.sessionDone).toBe(false);
    expect(next.score).toBe(7);
  });
});
