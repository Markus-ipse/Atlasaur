// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ControlZone } from "./ControlZone";
import type { GameApi } from "../game/useGame";
import type { Country, Feedback, Mode } from "../types";

const SAMPLE: Country = {
  numeric: "250",
  iso3: "FRA",
  name: "France",
  aliases: [],
};

function makeGame(overrides: {
  mode?: Mode;
  feedback?: Feedback | null;
  current?: Country;
}): GameApi {
  return {
    state: {
      mode: overrides.mode ?? "name-to-click",
      current: overrides.current ?? SAMPLE,
      feedback: overrides.feedback ?? null,
      phase: "normal",
      score: 0,
      streak: 0,
      bestStreak: 0,
      total: 0,
      missed: [],
      missedSet: new Set<string>(),
      retryQueue: [],
      sessionDone: false,
    },
    unlearnedCount: 0,
    isoFromNumeric: () => undefined,
    numericFromIso3: () => undefined,
    countryNameByIso3: () => undefined,
    matchTypedAnswer: () => "",
    answer: vi.fn(),
    skip: vi.fn(),
    dismiss: vi.fn(),
    setMode: vi.fn(),
    endSession: vi.fn(),
    startReview: vi.fn(),
    reset: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
});

describe("ControlZone", () => {
  it("renders Skip when there is no feedback", () => {
    const game = makeGame({});
    render(<ControlZone game={game} />);
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("autofocuses Continue when feedback is wrong", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game = makeGame({ feedback: wrong });
    render(<ControlZone game={game} />);
    const cont = screen.getByRole("button", { name: "Continue" });
    expect(document.activeElement).toBe(cont);
  });

  it("does not autofocus Continue on a correct answer (button isn't shown)", () => {
    const correct: Feedback = {
      kind: "correct",
      answerIso3: "FRA",
      correctIso3: "FRA",
    };
    const game = makeGame({ feedback: correct });
    render(<ControlZone game={game} />);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    // Skip is shown but disabled because feedback is non-null
    const skip = screen.getByRole("button", { name: "Skip" }) as HTMLButtonElement;
    expect(skip.disabled).toBe(true);
  });

  it("Skip click invokes game.skip", () => {
    const game = makeGame({});
    render(<ControlZone game={game} />);
    act(() => {
      screen.getByRole("button", { name: "Skip" }).click();
    });
    expect(game.skip).toHaveBeenCalledTimes(1);
  });

  it("Continue click invokes game.dismiss", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game = makeGame({ feedback: wrong });
    render(<ControlZone game={game} />);
    act(() => {
      screen.getByRole("button", { name: "Continue" }).click();
    });
    expect(game.dismiss).toHaveBeenCalledTimes(1);
  });

  it("renders the AnswerInput only in shape-to-name mode", () => {
    const a = makeGame({ mode: "name-to-click" });
    const { rerender } = render(<ControlZone game={a} />);
    expect(screen.queryByPlaceholderText(/type the country name/i)).toBeNull();
    rerender(<ControlZone game={makeGame({ mode: "shape-to-name" })} />);
    expect(screen.getByPlaceholderText(/type the country name/i)).toBeTruthy();
  });
});
