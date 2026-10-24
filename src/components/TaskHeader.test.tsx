// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TaskHeader } from "./TaskHeader";
import type { GameApi } from "../game/useGame";
import type { Feedback } from "../types";
import { emptyCounters } from "../game/counters";

afterEach(cleanup);

// Only what the header reads; the menu's StatusBar reads the rest.
function makeGame(
  feedback: Feedback | null = null,
  streak = 0,
  mode = "country-to-capital",
): GameApi {
  const game = {
    state: {
      mode,
      practiceMode: "study",
      phase: "normal",
      current: {
        iso3: "PER",
        name: "Peru",
        capital: "Lima",
        capitalAlternates: [],
      },
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
    counters: emptyCounters(),
    returns: { daysPlayed: 0, longestGap: null, capped: false },
    endSession: vi.fn(),
    setMode: vi.fn(),
    setContinents: vi.fn(),
    setIncludeTerritories: vi.fn(),
    resetSrs: vi.fn(),
  };
  return game as unknown as GameApi;
}

function renderHeader(
  game: GameApi,
  extra: { capitalOnMiss?: boolean; caughtUp?: boolean } = {},
) {
  render(
    <TaskHeader
      game={game}
      showCount
      {...extra}
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
    expect(
      screen.queryByRole("dialog", { name: "Round and settings" }),
    ).toBeNull();
  });

  const miss: Feedback = {
    kind: "skipped",
    answerIso3: "",
    correctIso3: "PER",
    at: 0,
  };

  it("names the capital in the question's place through a miss in the dock", () => {
    // The map's label by the capital dot is not always drawn.
    renderHeader(makeGame(miss, 0, "shape-to-name"), { capitalOnMiss: true });
    expect(screen.getByText("Capital")).toBeTruthy();
    expect(screen.getByText("Lima")).toBeTruthy();
    expect(screen.queryByText("What country is highlighted?")).toBeNull();
  });

  it("leaves the question up where the capital was the answer", () => {
    renderHeader(makeGame(miss), { capitalOnMiss: true });
    expect(screen.getByText("Capital of")).toBeTruthy();
  });

  it("asks nothing while the caught-up banner stands in for the card", () => {
    renderHeader(makeGame(), { caughtUp: true });
    expect(screen.queryByText("Capital of")).toBeNull();
    expect(screen.queryByLabelText("Card 3 of 12 this round")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Round and settings" }),
    ).toBeTruthy();
  });

  it("lets Settings opened from the menu take its own Escape", () => {
    renderHeader(makeGame());
    fireEvent.click(screen.getByRole("button", { name: "Round and settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    expect(
      screen.getByRole("dialog", { name: "Round and settings" }),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "Round and settings" }),
    ).toBeNull();
  });

  it("keeps Tab inside the menu, away from the field behind it", () => {
    renderHeader(makeGame());
    fireEvent.click(screen.getByRole("button", { name: "Round and settings" }));
    const menu = screen.getByRole("dialog", { name: "Round and settings" });
    const buttons = menu.querySelectorAll("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    // From the dialog itself, where focus lands on opening.
    menu.focus();
    fireEvent.keyDown(menu, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
