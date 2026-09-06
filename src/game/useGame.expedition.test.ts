// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGame } from "./useGame";
import {
  EXPEDITION_SIZE,
  EXPEDITION_STORAGE_KEY,
  type ExpeditionStore,
} from "./expedition";
import { loadStreak } from "./streak";
import { loadCounters } from "./counters";

// The hook owns the day logic and the credits the reducer does not: which
// store `startExpedition` hands in, and the streak day and finished-round
// count a completed expedition earns.

const TODAY = new Date(2026, 8, 6, 12, 0, 0);

function stored(day: string, outcomes: ExpeditionStore["outcomes"]): void {
  const store: ExpeditionStore = {
    version: 1,
    day,
    iso3s: ["FRA", "BRA", "JPN", "EGY", "AUS", "CAN", "IND", "ARG", "NGA", "DEU"],
    outcomes,
  };
  window.localStorage.setItem("atlasaur:expedition:v1", JSON.stringify(store));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("useGame — the Daily Expedition", () => {
  it("builds today's ten, once, and counts the start once", () => {
    const { result } = renderHook(() => useGame());
    expect(result.current.expeditionToday).toEqual({ kind: "fresh" });
    act(() => result.current.startExpedition());
    const first = result.current.state.expedition!;
    expect(first.day).toBe("2026-09-06");
    expect(first.iso3s).toHaveLength(EXPEDITION_SIZE);
    expect(result.current.counters.roundsByPractice.expedition).toBe(1);
    // Leave and come back: the same store, no second start.
    act(() => result.current.setPracticeMode("study"));
    act(() => result.current.startExpedition());
    expect(result.current.state.expedition).toBe(first);
    expect(result.current.counters.roundsByPractice.expedition).toBe(1);
  });

  it("replaces a stale unfinished store rather than resuming it", () => {
    stored("2026-09-05", ["found", "missed", "found"]);
    const { result } = renderHook(() => useGame());
    expect(result.current.expeditionToday).toEqual({ kind: "fresh" });
    act(() => result.current.startExpedition());
    const store = result.current.state.expedition!;
    expect(store.day).toBe("2026-09-06");
    expect(store.outcomes).toEqual([]);
    expect(result.current.state.roundCards).toBe(0);
  });

  it("resumes today's unfinished store where it was left", () => {
    stored("2026-09-06", ["found", "missed", "found"]);
    const { result } = renderHook(() => useGame());
    expect(result.current.expeditionToday).toEqual({
      kind: "in-progress",
      answered: 3,
      found: 2,
    });
    act(() => result.current.startExpedition());
    expect(result.current.state.current.iso3).toBe("EGY");
    expect(result.current.state.roundCards).toBe(3);
    // Resuming is not a start.
    expect(result.current.counters.roundsByPractice.expedition).toBe(0);
  });

  it("credits the finish off the store when the tenth answer lands", () => {
    stored("2026-09-06", Array(EXPEDITION_SIZE - 1).fill("found"));
    const { result } = renderHook(() => useGame());
    act(() => result.current.startExpedition());
    expect(result.current.state.current.iso3).toBe("DEU");
    expect(result.current.streak.todayPlayed).toBe(false);
    // The tenth answer, with its reveal still open: no dismiss, as when the
    // tab closes on it.
    act(() => result.current.answer("FRA"));
    expect(result.current.state.feedback?.kind).toBe("wrong");
    expect(result.current.streak.todayPlayed).toBe(true);
    expect(loadStreak().days).toEqual(["2026-09-06"]);
    expect(loadCounters().roundsFinished).toBe(1);
    expect(loadCounters().answersByQuestionMode["name-to-click"]).toBe(1);
  });

  it("does not credit a store loaded already finished", () => {
    stored("2026-09-06", Array(EXPEDITION_SIZE).fill("missed"));
    const { result } = renderHook(() => useGame());
    expect(result.current.expeditionToday).toEqual({ kind: "finished", found: 0 });
    act(() => result.current.startExpedition());
    expect(result.current.state.sessionDone).toBe(true);
    expect(loadStreak().days).toEqual([]);
    expect(loadCounters().roundsFinished).toBe(0);
  });

  it("follows another tab's write through the storage event", () => {
    stored("2026-09-06", ["found"]);
    const { result } = renderHook(() => useGame());
    act(() => result.current.startExpedition());
    expect(result.current.state.current.iso3).toBe("BRA");
    const ahead: ExpeditionStore = {
      ...result.current.state.expedition!,
      outcomes: ["found", "missed", "missed"],
    };
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: EXPEDITION_STORAGE_KEY,
          newValue: JSON.stringify(ahead),
        }),
      );
    });
    expect(result.current.state.expedition).toEqual(ahead);
    expect(result.current.state.current.iso3).toBe("EGY");
    expect(result.current.state.roundCards).toBe(3);
    // A write to some other key, or a malformed one, changes nothing.
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "atlasaur:streak:v1", newValue: "{}" }),
      );
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: EXPEDITION_STORAGE_KEY,
          newValue: "{not json",
        }),
      );
    });
    expect(result.current.state.expedition).toEqual(ahead);
    // A removed key is an erase in another tab: the store goes and the run
    // is left.
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: EXPEDITION_STORAGE_KEY, newValue: null }),
      );
    });
    expect(result.current.state.expedition).toBeNull();
    expect(result.current.state.practiceMode).toBe("study");
  });

  it("keeps the learner's own scope for the figures while the map opens up", () => {
    window.localStorage.setItem(
      "atlasaur:selectedContinents",
      JSON.stringify(["Europe"]),
    );
    const { result } = renderHook(() => useGame());
    const before = result.current.scopeSet.size;
    expect(result.current.isInScope("BRA")).toBe(false);
    act(() => result.current.startExpedition());
    expect(result.current.scopeSet.size).toBe(before);
    expect(result.current.totalInScope).toBe(before);
    expect(result.current.isInScope("BRA")).toBe(true);
    // Territories are never asked, so they stay inert.
    expect(result.current.isInScope("GRL")).toBe(false);
    act(() => result.current.setPracticeMode("study"));
    expect(result.current.isInScope("BRA")).toBe(false);
  });

  it("keeps the same map predicate across a Study / test flip", () => {
    // Otherwise the map's resting frame is recomputed and re-settled on
    // every "Test me on these".
    const { result } = renderHook(() => useGame());
    const study = result.current.isInScope;
    act(() => result.current.setPracticeMode("quiz"));
    expect(result.current.isInScope).toBe(study);
  });

  it("discards a stored ten this build cannot ask", () => {
    // Greenland is a territory: never in the pool, so never clickable in an
    // expedition. A store naming it is dropped rather than half-asked.
    const store: ExpeditionStore = {
      version: 1,
      day: "2026-09-06",
      iso3s: ["FRA", "BRA", "JPN", "EGY", "AUS", "CAN", "IND", "ARG", "NGA", "GRL"],
      outcomes: ["found"],
    };
    window.localStorage.setItem("atlasaur:expedition:v1", JSON.stringify(store));
    const { result } = renderHook(() => useGame());
    expect(result.current.state.expedition).toBeNull();
    expect(result.current.expeditionToday).toEqual({ kind: "fresh" });
  });

  it("turns the door over at local midnight, not an hour later", () => {
    vi.setSystemTime(new Date(2026, 8, 6, 23, 59, 30));
    stored("2026-09-06", Array(EXPEDITION_SIZE).fill("found"));
    const { result } = renderHook(() => useGame());
    expect(result.current.expeditionToday).toEqual({ kind: "finished", found: 10 });
    act(() => {
      vi.advanceTimersByTime(45_000);
    });
    expect(result.current.expeditionToday).toEqual({ kind: "fresh" });
    // And the click agrees: it builds tomorrow's ten.
    act(() => result.current.startExpedition());
    expect(result.current.state.expedition?.day).toBe("2026-09-07");
    expect(result.current.state.expedition?.outcomes).toEqual([]);
  });

  it("re-reads storage at the door, so a store declined mid-run is not rebuilt", () => {
    // Yesterday's run is in state; another tab has since written today's
    // store with one answer, and no event reached this tab.
    stored("2026-09-05", ["found", "missed"]);
    const { result } = renderHook(() => useGame());
    expect(result.current.state.expedition?.day).toBe("2026-09-05");
    stored("2026-09-06", ["found"]);
    act(() => result.current.startExpedition());
    expect(result.current.state.expedition?.day).toBe("2026-09-06");
    expect(result.current.state.expedition?.outcomes).toEqual(["found"]);
    expect(result.current.state.roundCards).toBe(1);
    // Resuming what another tab began is not a start.
    expect(result.current.counters.roundsByPractice.expedition).toBe(0);
  });

  it("books an answer to Name → Click even when leaving restores typing", () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.setMode("shape-to-name"));
    act(() => result.current.startExpedition());
    const first = result.current.state.current.iso3;
    act(() => result.current.answer(first === "FRA" ? "DEU" : "FRA"));
    // Leave with the reveal open.
    act(() => result.current.endSession());
    expect(result.current.state.mode).toBe("shape-to-name");
    expect(loadCounters().answersByQuestionMode).toEqual({
      "name-to-click": 1,
      "shape-to-name": 0,
    });
  });
});
