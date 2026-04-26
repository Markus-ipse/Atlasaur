// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import { ControlZone } from "./ControlZone";
import type { GameApi } from "../game/useGame";
import { ALL_CONTINENTS, type Country, type Feedback, type Mode } from "../types";

const SAMPLE: Country = {
  numeric: "250",
  iso3: "FRA",
  name: "France",
  aliases: [],
  continent: "Europe",
};

const NAMES_BY_ISO3: Record<string, string> = {
  FRA: "France",
  DEU: "Germany",
};

function makeGame(overrides: {
  mode?: Mode;
  feedback?: Feedback | null;
  current?: Country;
}): GameApi {
  return {
    state: {
      mode: overrides.mode ?? "name-to-click",
      selectedContinents: ALL_CONTINENTS,
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
    nameFromIso3: (iso3) => NAMES_BY_ISO3[iso3] ?? iso3,
    isInScope: () => true,
    matchTypedAnswer: () => "",
    answer: vi.fn(),
    skip: vi.fn(),
    dismiss: vi.fn(),
    setMode: vi.fn(),
    setContinents: vi.fn(),
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

  it("shows selected and correct country names on a wrong click", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game = makeGame({ mode: "name-to-click", feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("You selected: Germany");
    expect(status.textContent).toContain("Correct answer: France");
  });

  it("shows only the correct answer when skipped (no You selected line)", () => {
    const skipped: Feedback = {
      kind: "skipped",
      answerIso3: "",
      correctIso3: "FRA",
    };
    const game = makeGame({ mode: "name-to-click", feedback: skipped });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Correct answer: France");
    expect(status.textContent).not.toContain("You selected");
  });

  it("shows correct answer in shape-to-name mode without You selected line", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game = makeGame({ mode: "shape-to-name", feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Correct answer: France");
    expect(status.textContent).not.toContain("You selected");
  });

  it("renders no feedback message on a correct answer", () => {
    const correct: Feedback = {
      kind: "correct",
      answerIso3: "FRA",
      correctIso3: "FRA",
    };
    const game = makeGame({ feedback: correct });
    render(<ControlZone game={game} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the AnswerInput only in shape-to-name mode", () => {
    const a = makeGame({ mode: "name-to-click" });
    const { rerender } = render(<ControlZone game={a} />);
    expect(screen.queryByPlaceholderText(/type the country name/i)).toBeNull();
    rerender(<ControlZone game={makeGame({ mode: "shape-to-name" })} />);
    expect(screen.getByPlaceholderText(/type the country name/i)).toBeTruthy();
  });
});
