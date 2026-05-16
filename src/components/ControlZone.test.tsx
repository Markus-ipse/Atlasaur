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
  subregion: "Western Europe",
  capital: "Paris",
  neighbors: ["DEU", "BEL", "LUX", "CHE", "ITA", "ESP"],
  sizeTier: 2,
  notabilityTier: 2,
};

const NAMES_BY_ISO3: Record<string, string> = {
  FRA: "France",
  DEU: "Germany",
  BEL: "Belgium",
  LUX: "Luxembourg",
  CHE: "Switzerland",
  ITA: "Italy",
  ESP: "Spain",
  JPN: "Japan",
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
    showLabelsOnReveal: true,
    setShowLabelsOnReveal: vi.fn(),
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

  it("shows picked and correct country names on a wrong click", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game = makeGame({ mode: "name-to-click", feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("You picked: Germany");
    // Assert the label-name pairing — only the hero produces this sequence.
    expect(status.textContent).toMatch(/You missed[\s\S]*France/);
  });

  it("shows only the correct answer when skipped (no You picked line)", () => {
    const skipped: Feedback = {
      kind: "skipped",
      answerIso3: "",
      correctIso3: "FRA",
    };
    const game = makeGame({ mode: "name-to-click", feedback: skipped });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Skipped[\s\S]*France/);
    expect(status.textContent).not.toContain("You picked");
  });

  it("shows correct answer in shape-to-name mode without You picked line", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game = makeGame({ mode: "shape-to-name", feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/You missed[\s\S]*France/);
    expect(status.textContent).not.toContain("You picked");
  });

  it("shows capital and neighbors on a wrong answer", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game = makeGame({ feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Capital: Paris");
    expect(status.textContent).toContain(
      "Bordered by: Belgium, Germany, Italy, Luxembourg, Spain, Switzerland",
    );
  });

  it("shows capital on a skip too", () => {
    const skipped: Feedback = {
      kind: "skipped",
      answerIso3: "",
      correctIso3: "FRA",
    };
    const game = makeGame({ feedback: skipped });
    render(<ControlZone game={game} />);
    expect(screen.getByRole("status").textContent).toContain("Capital: Paris");
  });

  it("omits the Bordered by line for countries with no land neighbors", () => {
    const japan: Country = {
      numeric: "392",
      iso3: "JPN",
      name: "Japan",
      aliases: [],
      continent: "Asia",
      subregion: "Eastern Asia",
      capital: "Tokyo",
      neighbors: [],
      sizeTier: 1,
      notabilityTier: 2,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "JPN",
    };
    const game = makeGame({ current: japan, feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Capital: Tokyo");
    expect(status.textContent).not.toContain("Bordered by");
  });

  it("omits the Capital line when capital is null (e.g. Antarctica)", () => {
    const antarctica: Country = {
      numeric: "010",
      iso3: "ATA",
      name: "Antarctica",
      aliases: [],
      continent: "Antarctica",
      subregion: "Antarctica",
      capital: null,
      neighbors: [],
      sizeTier: 3,
      notabilityTier: 2,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "ATA",
    };
    const game = makeGame({ current: antarctica, feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/You missed[\s\S]*Antarctica/);
    expect(status.textContent).not.toContain("Capital");
  });

  it("renders YOU MISSED label on wrong, SKIPPED label on skip", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
    };
    const game1 = makeGame({ feedback: wrong });
    const { rerender } = render(<ControlZone game={game1} />);
    expect(screen.getByRole("status").textContent).toContain("You missed");
    expect(screen.getByRole("status").textContent).not.toContain("Skipped");

    const skipped: Feedback = {
      kind: "skipped",
      answerIso3: "",
      correctIso3: "FRA",
    };
    const game2 = makeGame({ feedback: skipped });
    rerender(<ControlZone game={game2} />);
    expect(screen.getByRole("status").textContent).toContain("Skipped");
    expect(screen.getByRole("status").textContent).not.toContain("You missed");
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

  it("renders plural Capitals: with one alternate (Bolivia)", () => {
    const bolivia: Country = {
      numeric: "068",
      iso3: "BOL",
      name: "Bolivia",
      aliases: [],
      continent: "South America",
      subregion: "South America",
      capital: "Sucre",
      capitalAlternates: ["La Paz"],
      neighbors: [],
      sizeTier: 2,
      notabilityTier: 1,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "BOL",
    };
    const game = makeGame({ current: bolivia, feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Capitals: Sucre, La Paz");
    expect(status.textContent).not.toContain("Capital: Sucre");
  });

  it("renders plural Capitals: with two alternates (South Africa)", () => {
    const southAfrica: Country = {
      numeric: "710",
      iso3: "ZAF",
      name: "South Africa",
      aliases: ["RSA"],
      continent: "Africa",
      subregion: "Southern Africa",
      capital: "Pretoria",
      capitalAlternates: ["Cape Town", "Bloemfontein"],
      neighbors: [],
      sizeTier: 2,
      notabilityTier: 2,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "ZAF",
    };
    const game = makeGame({ current: southAfrica, feedback: wrong });
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain(
      "Capitals: Pretoria, Cape Town, Bloemfontein",
    );
  });

  it("renders a single neighbor without a trailing comma (Lesotho)", () => {
    // Case 2 from m2-followups: Lesotho's only neighbor is ZAF. We don't
    // get to assert the visual frame here (that's the manual checklist),
    // but the text content is testable.
    const lesotho: Country = {
      numeric: "426",
      iso3: "LSO",
      name: "Lesotho",
      aliases: [],
      continent: "Africa",
      subregion: "Southern Africa",
      capital: "Maseru",
      neighbors: ["ZAF"],
      sizeTier: 0,
      notabilityTier: 0,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "LSO",
    };
    const namesByIso3: Record<string, string> = {
      ...NAMES_BY_ISO3,
      LSO: "Lesotho",
      ZAF: "South Africa",
    };
    const game = makeGame({ current: lesotho, feedback: wrong });
    game.nameFromIso3 = (iso3) => namesByIso3[iso3] ?? iso3;
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Bordered by: South Africa");
    // No trailing comma — single neighbor.
    expect(status.textContent).not.toMatch(/Bordered by: South Africa,/);
  });

  it("renders many neighbors comma-joined and alphabetically sorted (Russia)", () => {
    // Case 5 (text portion only) from m2-followups. Visual line-wrapping in
    // the space-y-1 container is the manual case 8 (mobile portrait).
    const russia: Country = {
      numeric: "643",
      iso3: "RUS",
      name: "Russia",
      aliases: [],
      continent: "Europe",
      subregion: "Eastern Europe",
      capital: "Moscow",
      neighbors: [
        "AZE",
        "BLR",
        "CHN",
        "EST",
        "FIN",
        "GEO",
        "KAZ",
        "LVA",
        "LTU",
        "MNG",
        "NOR",
        "POL",
        "PRK",
        "UKR",
      ],
      sizeTier: 3,
      notabilityTier: 2,
    };
    const russiaNames: Record<string, string> = {
      RUS: "Russia",
      AZE: "Azerbaijan",
      BLR: "Belarus",
      CHN: "China",
      EST: "Estonia",
      FIN: "Finland",
      GEO: "Georgia",
      KAZ: "Kazakhstan",
      LVA: "Latvia",
      LTU: "Lithuania",
      MNG: "Mongolia",
      NOR: "Norway",
      POL: "Poland",
      PRK: "North Korea",
      UKR: "Ukraine",
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "RUS",
    };
    const game = makeGame({ current: russia, feedback: wrong });
    game.nameFromIso3 = (iso3) => russiaNames[iso3] ?? iso3;
    render(<ControlZone game={game} />);
    const status = screen.getByRole("status");
    // Alphabetical by display name. North Korea sorts under "N".
    expect(status.textContent).toContain(
      "Bordered by: Azerbaijan, Belarus, China, Estonia, Finland, Georgia, Kazakhstan, Latvia, Lithuania, Mongolia, North Korea, Norway, Poland, Ukraine",
    );
  });

  it("renders the AnswerInput only in shape-to-name mode", () => {
    const a = makeGame({ mode: "name-to-click" });
    const { rerender } = render(<ControlZone game={a} />);
    expect(screen.queryByPlaceholderText(/type the country name/i)).toBeNull();
    rerender(<ControlZone game={makeGame({ mode: "shape-to-name" })} />);
    expect(screen.getByPlaceholderText(/type the country name/i)).toBeTruthy();
  });
});
