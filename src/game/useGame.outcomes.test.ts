// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGame } from "./useGame";
import { EXPEDITION_STORAGE_KEY, type ExpeditionStore } from "./expedition";
import { loadOutcomes, OUTCOME_KEY_PREFIX } from "./outcomes";

// The hook decides when an answer is logged: once, when its feedback appears,
// with the mode, practice mode and phase it was given in.

const TODAY = new Date(2026, 8, 13, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

type Game = ReturnType<typeof useGame>;

function wrongFor(game: Game): string {
  return game.state.current.iso3 === "FRA" ? "DEU" : "FRA";
}

describe("useGame — the outcome log", () => {
  it("logs one entry for a Study answer, with its time and the country given", () => {
    const { result } = renderHook(() => useGame());
    const asked = result.current.state.current.iso3;
    const given = wrongFor(result.current);
    act(() => result.current.answer(given));
    expect(loadOutcomes()).toEqual([
      {
        at: TODAY.getTime(),
        asked,
        mode: "name-to-click",
        practice: "study",
        phase: "normal",
        outcome: "wrong",
        given,
      },
    ]);
  });

  it("logs a skip, and a typed answer that matched nothing as wrong with nothing given", () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.skip());
    act(() => result.current.dismiss());
    act(() => result.current.answer(""));
    expect(loadOutcomes().map((o) => [o.outcome, o.given])).toEqual([
      ["skipped", ""],
      ["wrong", ""],
    ]);
  });

  it("logs a test round's answers in the normal phase and in its review pass", () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.setPracticeMode("quiz"));
    act(() => result.current.answer(wrongFor(result.current)));
    act(() => result.current.dismiss());
    act(() => result.current.endSession());
    act(() => result.current.startReview());
    expect(result.current.state.phase).toBe("review");
    act(() => result.current.answer(result.current.state.current.iso3));
    expect(loadOutcomes().map((o) => [o.practice, o.phase, o.outcome])).toEqual([
      ["quiz", "normal", "wrong"],
      ["quiz", "review", "correct"],
    ]);
  });

  it("logs an expedition answer as an expedition", () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.startExpedition());
    act(() => result.current.answer(result.current.state.current.iso3));
    expect(loadOutcomes().map((o) => [o.practice, o.outcome])).toEqual([
      ["expedition", "correct"],
    ]);
  });

  it("keeps an answer given just before month-end in that month, even if the effect runs after", () => {
    const lastSecond = new Date(2026, 8, 30, 23, 59, 59);
    vi.setSystemTime(lastSecond);
    const { result } = renderHook(() => useGame());
    act(() => {
      result.current.answer(wrongFor(result.current));
      // The clock turns over before the effect runs.
      vi.setSystemTime(new Date(2026, 9, 1, 0, 0, 1));
    });
    expect(loadOutcomes().map((o) => o.at)).toEqual([lastSecond.getTime()]);
    expect(window.localStorage.getItem(OUTCOME_KEY_PREFIX + "2026-09")).not.toBeNull();
    expect(window.localStorage.getItem(OUTCOME_KEY_PREFIX + "2026-10")).toBeNull();
  });

  it("adds nothing on dismiss, a mode switch or a scope change", () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.answer(wrongFor(result.current)));
    act(() => result.current.dismiss());
    act(() => result.current.answer(wrongFor(result.current)));
    act(() => result.current.setMode("shape-to-name"));
    act(() => result.current.answer(wrongFor(result.current)));
    act(() => result.current.setContinents(["Europe"]));
    expect(loadOutcomes()).toHaveLength(3);
  });

  it("adds nothing when another tab's expedition is adopted", () => {
    const { result } = renderHook(() => useGame());
    act(() => result.current.startExpedition());
    act(() => result.current.answer(wrongFor(result.current)));
    const mine = result.current.state.expedition!;
    const theirs: ExpeditionStore = {
      ...mine,
      outcomes: [...mine.outcomes, "found", "found"],
    };
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: EXPEDITION_STORAGE_KEY,
          newValue: JSON.stringify(theirs),
        }),
      );
    });
    expect(result.current.state.expedition?.outcomes).toHaveLength(3);
    expect(loadOutcomes()).toHaveLength(1);
  });

  it("erases every month key with all progress", () => {
    window.localStorage.setItem(
      OUTCOME_KEY_PREFIX + "2026-08",
      JSON.stringify({ version: 1, entries: [] }),
    );
    const { result } = renderHook(() => useGame());
    act(() => result.current.answer(wrongFor(result.current)));
    act(() => result.current.resetSrs());
    expect(loadOutcomes()).toEqual([]);
    expect(window.localStorage.getItem(OUTCOME_KEY_PREFIX + "2026-08")).toBeNull();
    expect(window.localStorage.getItem(OUTCOME_KEY_PREFIX + "2026-09")).toBeNull();
  });
});
