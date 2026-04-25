import { describe, it, expect } from "vitest";
import { reducer, initialState, type State } from "./useGame";
import type { Country } from "../types";

function withCurrent(state: State, iso3: string): State {
  // Force a known current country by pulling it from any state's seed pool
  // via reducer-internal lookup is overkill; we just rebuild the country
  // with the same iso3 and trust the reducer keys off iso3.
  const country: Country = { numeric: "000", iso3, name: iso3, aliases: [] };
  return { ...state, current: country };
}

describe("reducer — normal phase", () => {
  it("answer-correct: increments score, streak, total; sets correct feedback", () => {
    const s0 = withCurrent(initialState(), "FRA");
    const s1 = reducer(s0, { type: "answer", iso3: "FRA" });
    expect(s1.score).toBe(1);
    expect(s1.streak).toBe(1);
    expect(s1.bestStreak).toBe(1);
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
      { ...s0, streak: 3, bestStreak: 3 },
      { type: "answer", iso3: "DEU" },
    );
    expect(s1.score).toBe(0);
    expect(s1.streak).toBe(0);
    expect(s1.bestStreak).toBe(3);
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
      bestStreak: before.bestStreak,
      total: before.total,
      missed: before.missed,
    };
    const after = reducer(before, {
      type: "answer",
      iso3: before.current.iso3,
    });
    expect(after.score).toBe(baseline.score);
    expect(after.streak).toBe(baseline.streak);
    expect(after.bestStreak).toBe(baseline.bestStreak);
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
  });
});
