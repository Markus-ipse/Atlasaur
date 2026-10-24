// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TaskHeader } from "./TaskHeader";
import type { GameApi } from "../game/useGame";
import type { Feedback } from "../types";

afterEach(cleanup);

// Only what the header reads; the menu's StatusBar reads the rest.
function makeGame(feedback: Feedback | null = null, streak = 0): GameApi {
  const game = {
    state: {
      mode: "country-to-capital",
      practiceMode: "study",
      phase: "normal",
      current: { iso3: "PER", name: "Peru", capital: "Lima" },
      feedback,
      streak,
      milestone: null,
      spotlightSubregion: null,
      roundCards: 2,
      retryQueue: [],
      sessionDone: false,
      roundDone: false,
      selectedContinents: [],
      includeTerritories: false,
      newIntroducedThisStretch: 0,
      srsStore: { version: 2, facts: { location: {}, capital: {} } },
    },
    fact: "capital",
    dueCount: 4,
    newAvailableCount: 0,
    scopeSet: new Set<string>(),
    totalInScope: 0,
    counters: {},
    returns: { daysPlayed: 0, longestGap: null, capped: false },
    endSession: vi.fn(),
    setMode: vi.fn(),
    setContinents: vi.fn(),
    setIncludeTerritories: vi.fn(),
    resetSrs: vi.fn(),
  };
  return game as unknown as GameApi;
}

function renderHeader(game: GameApi) {
  render(
    <TaskHeader
      game={game}
      showCount
      themePref="system"
      onSetThemePref={() => {}}
    />,
  );
}

describe("TaskHeader", () => {
  it("asks the question in one line beside the round count", () => {
    renderHeader(makeGame());
    expect(screen.getByText("Capital of")).toBeTruthy();
    expect(screen.getByText("Peru")).toBeTruthy();
    expect(screen.getByLabelText("Card 3 of 12 this round")).toBeTruthy();
  });

  it("says the ceremony line in the question's place through a correct flash", () => {
    const hit: Feedback = {
      kind: "correct",
      answerIso3: "PER",
      correctIso3: "PER",
      at: 0,
    };
    renderHeader(makeGame(hit, 5));
    expect(screen.queryByText("Capital of")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/\S/);
  });

  it("keeps Done and the figures in the menu, which a tap outside only closes", () => {
    const game = makeGame();
    renderHeader(game);
    const more = screen.getByRole("button", { name: "Round and settings" });
    fireEvent.click(more);
    const menu = screen.getByRole("dialog", { name: "Round and settings" });
    expect(document.activeElement).toBe(menu);
    expect(menu.textContent).toContain("coming back");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(game.endSession).toHaveBeenCalled();
    fireEvent.click(document.querySelector("[data-task-menu-scrim]")!);
    expect(screen.queryByRole("dialog", { name: "Round and settings" })).toBeNull();
  });
});
