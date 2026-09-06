import { describe, it, expect } from "vitest";
import { reducer, initialState, ROUND_SIZE, type State } from "./useGame";
import { STUDY_NEW_CAP } from "./pickCountry";
import { grade as srsGrade, introductionOrder } from "./srs";
import { crossesIntoKnown } from "./milestones";
import countriesData from "../data/countries.json";
import { ALL_CONTINENTS, type Country } from "../types";

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
      feedback: { kind: "correct", answerIso3: "ATA", correctIso3: "ATA" },
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

describe("reducer — SRS write-through (Quiz normal phase)", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");

  it("answer-correct in Quiz writes a Good grade to srsStore", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
    expect(s1.srsStore.records["FRA"]).toBeDefined();
    expect(s1.srsStore.records["FRA"].reps).toBe(1);
  });

  it("answer-wrong in Quiz writes an Again grade to srsStore", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "DEU", now: NOW });
    expect(s1.srsStore.records["FRA"]).toBeDefined();
    expect(s1.srsStore.records["FRA"].reps).toBe(1);
  });

  it("skip in Quiz writes an Again grade", () => {
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
    expect(next.srsStore.records["FRA"]).toEqual(s1.srsStore.records["FRA"]);
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
    expect(s1.srsStore.records["FRA"]).toBeUndefined();
  });

  it("answer-correct in Study defers auto-Good until dismiss", () => {
    const s0 = studyState();
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: NOW });
    expect(s1.autoGradePending).toBe("Good");
    expect(s1.srsStore.records["FRA"]).toBeUndefined();
    expect(s1.feedback?.kind).toBe("correct");

    const s2 = reducer(s1, { type: "dismiss", now: NOW });
    expect(s2.srsStore.records["FRA"]).toBeDefined();
    expect(s2.autoGradePending).toBeNull();
  });

  it("skip in Study defers auto-Again until dismiss", () => {
    const s0 = studyState();
    const s1 = reducer(s0, { type: "skip", now: NOW });
    expect(s1.autoGradePending).toBe("Again");
    expect(s1.srsStore.records["FRA"]).toBeUndefined();
    expect(s1.feedback?.kind).toBe("skipped");

    const s2 = reducer(s1, { type: "dismiss", now: NOW });
    expect(s2.srsStore.records["FRA"]).toBeDefined();
    expect(s2.autoGradePending).toBeNull();
  });

  it("dismiss after a wrong commits Again and advances", () => {
    let s = studyState();
    s = reducer(s, { type: "answer", iso3: "DEU", now: NOW });
    expect(s.autoGradePending).toBe("Again");
    s = reducer(s, { type: "dismiss", now: NOW });
    expect(s.srsStore.records["FRA"]).toBeDefined();
    expect(s.srsStore.records["FRA"].reps).toBe(1);
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
    expect(Object.keys(s.srsStore.records)).toHaveLength(1);
    const next = reducer(s, { type: "resetSrs" });
    expect(next.srsStore.records).toEqual({});
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
    expect(s.srsStore.records["FRA"]).toBeUndefined();
    s = reducer(s, { type: "endSession" });
    expect(s.sessionDone).toBe(true);
    expect(s.autoGradePending).toBeNull();
    expect(s.srsStore.records["FRA"]).toBeDefined();
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
    expect(s.srsStore.records["FRA"]).toBeDefined();
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
});

describe("reducer — spotlight subregion", () => {
  const NOW = new Date("2026-05-16T12:00:00Z");
  const SPOTLIGHT_CLEARED = "Spotlight cleared — back to full scope";

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
    expect(reducer(s, { type: "clearSpotlight" }).spotlightSubregion).toBeNull();
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

  it("setMode (question-mode flip) does not carry the spotlight", () => {
    const s = reducer(africaStudy(), {
      type: "setSpotlight",
      subregion: "Western Africa",
      now: NOW,
    });
    const next = reducer(s, { type: "setMode", mode: "shape-to-name" });
    expect(next.spotlightSubregion).toBeNull();
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
      feedback: { kind: "correct", answerIso3: "ZAF", correctIso3: "ZAF" },
      autoGradePending: "Good",
      // A due card outside the spotlight region, so the widened re-pick has
      // somewhere to land.
      srsStore: {
        version: 1,
        records: { EGY: srsGrade(null, "Again", tenDaysAgo) },
      },
    };
    const next = reducer(seeded, { type: "dismiss", now: NOW });
    expect(next.spotlightSubregion).toBeNull();
    expect(next.transientMessage).toBe(SPOTLIGHT_CLEARED);
    // Re-pick came from the full continent pool (the due EGY), not Southern Africa.
    expect(next.current.iso3).toBe("EGY");
  });

  it("depletes at activation via closeSummary: auto-clears and toasts", () => {
    const seeded: State = {
      ...withCurrent(africaStudy(), "EGY"),
      spotlightSubregion: "Southern Africa",
      newIntroducedThisStretch: STUDY_NEW_CAP, // already depleted region
      srsStore: { version: 1, records: {} },
      sessionDone: true,
    };
    const next = reducer(seeded, { type: "closeSummary", now: NOW });
    expect(next.spotlightSubregion).toBeNull();
    expect(next.transientMessage).toBe(SPOTLIGHT_CLEARED);
    expect(next.sessionDone).toBe(false);
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
    const iso3 = Object.keys(s.srsStore.records)[0];
    const seen = playCorrect(withCurrent(s, iso3));
    expect(seen.roundNew).toBe(1);
    expect(seen.roundRight).toBe(1);
  });

  it("opens the round break on the twelfth card and blocks answers until continued", () => {
    let s = initialState({ practiceMode: "study" });
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
    let s = initialState({ practiceMode: "study" });
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
    expect(toggled.srsStore.records["FRA"]?.misses).toBe(1);
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
      srsStore: { version: 1, records: { FRA: almost } },
    });
    const s1 = reducer(s0, { type: "answer", iso3: "FRA", now: later });
    expect(s1.milestone).not.toBeNull();
    expect(s1.milestone!.iso3).toBe("FRA");
  });

  it("marks nothing for a country that is already known", () => {
    const s0 = studyAt("FRA", {
      srsStore: { version: 1, records: { FRA: knownRecord() } },
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
      cardsAnswered: 30,
    };
    const erased = reducer(s0, { type: "resetSrs" });
    expect(erased.roundCards).toBe(0);
    expect(erased.roundRight).toBe(0);
    expect(erased.cardsAnswered).toBe(0);
  });
});
