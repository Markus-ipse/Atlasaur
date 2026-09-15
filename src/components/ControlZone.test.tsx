// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { ControlZone } from "./ControlZone";
import type { GameApi } from "../game/useGame";
import { emptyCounters } from "../game/counters";
import { emptyStore, grade } from "../game/srs";
import { storeWith } from "../game/srsFixtures";
import {
  ALL_CONTINENTS,
  type Country,
  type Feedback,
  type PracticeMode,
  type Phase,
  type QuestionMode,
  type SrsStore,
  type Subregion,
} from "../types";

const SAMPLE: Country = {
  numeric: "250",
  iso3: "FRA",
  name: "France",
  aliases: [],
  continent: "Europe",
  subregion: "Western Europe",
  capital: "Paris",
  capitalLonLat: [2.33, 48.87],
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
  PER: "Peru",
  ECU: "Ecuador",
  BRA: "Brazil",
};

function makeGame(overrides: {
  mode?: QuestionMode;
  practiceMode?: PracticeMode;
  feedback?: Feedback | null;
  current?: Country;
  srsStore?: SrsStore;
  phase?: Phase;
  spotlightSubregion?: Subregion | null;
}): GameApi {
  return {
    state: {
      mode: overrides.mode ?? "name-to-click",
      practiceMode: overrides.practiceMode ?? "quiz",
      selectedContinents: ALL_CONTINENTS,
      includeTerritories: false,
      current: overrides.current ?? SAMPLE,
      feedback: overrides.feedback ?? null,
      phase: overrides.phase ?? "normal",
      score: 0,
      streak: 0,
      milestone: null,
      cardsAnswered: 0,
      total: 0,
      missed: [],
      missedSet: new Set<string>(),
      retryQueue: [],
      completedSet: new Set<string>(),
      sessionDone: false,
      srsStore: overrides.srsStore ?? emptyStore(),
      newIntroducedThisStretch: 0,
      studyResurfaceQueue: [],
      studyStep: 0,
      autoGradePending: null,
      spotlightSubregion: overrides.spotlightSubregion ?? null,
      transientMessage: null,
      roundCards: 0,
      roundRight: 0,
      roundNew: 0,
      roundDone: false,
      roundsCompleted: 0,
      sittingCards: 0,
      sittingRight: 0,
      sittingNew: 0,
      expedition: null,
      modeBeforeExpedition: null,
    },
    unlearnedCount: 0,
    counters: emptyCounters(),
    returns: { daysPlayed: 0, longestGap: null, capped: false },
    totalInScope: 0,
    completedInScopeCount: 0,
    dueCount: 0,
    nextBack: null,
    newAvailableCount: 0,
    seenSrsIntro: true,
    markSrsIntroSeen: vi.fn(),
    streak: { length: 0, todayPlayed: false, day: 1 },
    expeditionToday: { kind: "fresh" },
    startExpedition: vi.fn(),
    showTodayCard: false,
    dismissTodayCard: vi.fn(),
    showWelcome: false,
    dismissWelcome: vi.fn(),
    scopeSet: new Set<string>(),
    setIncludeTerritories: vi.fn(),
    isoFromNumeric: () => undefined,
    numericFromIso3: () => undefined,
    nameFromIso3: (iso3) => NAMES_BY_ISO3[iso3] ?? iso3,
    isInScope: () => true,
    fact: "location",
    capitalOffer: null,
    matchTyped: () => "",
    answer: vi.fn(),
    skip: vi.fn(),
    dismiss: vi.fn(),
    setMode: vi.fn(),
    setPracticeMode: vi.fn(),
    setContinents: vi.fn(),
    endSession: vi.fn(),
    continueRound: vi.fn(),
    startReview: vi.fn(),
    resetSrs: vi.fn(),
    closeSummary: vi.fn(),
    setSpotlight: vi.fn(),
    clearSpotlight: vi.fn(),
    setTransientMessage: vi.fn(),
    reset: vi.fn(),
  };
}

afterEach(() => {
  cleanup();
});

describe("ControlZone", () => {
  it("renders Skip when there is no feedback", () => {
    const game = makeGame({});
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("autofocuses Continue when feedback is wrong", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
      at: 0,
    };
    const game = makeGame({ feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    const cont = screen.getByRole("button", { name: "Continue" });
    expect(document.activeElement).toBe(cont);
  });

  it("shows no action button during a correct answer (auto-dismiss handles it)", () => {
    const correct: Feedback = {
      kind: "correct",
      answerIso3: "FRA",
      correctIso3: "FRA",
      at: 0,
    };
    const game = makeGame({ feedback: correct });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("Skip click invokes game.skip", () => {
    const game = makeGame({});
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      at: 0,
    };
    const game = makeGame({ feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      at: 0,
    };
    const game = makeGame({ mode: "name-to-click", feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      at: 0,
    };
    const game = makeGame({ mode: "name-to-click", feedback: skipped });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/Skipped[\s\S]*France/);
    expect(status.textContent).not.toContain("You picked");
  });

  it("shows correct answer in shape-to-name mode without You picked line", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
      at: 0,
    };
    const game = makeGame({ mode: "shape-to-name", feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/You missed[\s\S]*France/);
    expect(status.textContent).not.toContain("You picked");
  });

  it("shows capital and neighbors on a wrong answer", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
      at: 0,
    };
    const game = makeGame({ feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      at: 0,
    };
    const game = makeGame({ feedback: skipped });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      capitalLonLat: [139.75, 35.68],
      neighbors: [],
      sizeTier: 1,
      notabilityTier: 2,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "JPN",
      at: 0,
    };
    const game = makeGame({ current: japan, feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      capitalLonLat: null,
      neighbors: [],
      sizeTier: 3,
      notabilityTier: 2,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "ATA",
      at: 0,
    };
    const game = makeGame({ current: antarctica, feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toMatch(/You missed[\s\S]*Antarctica/);
    expect(status.textContent).not.toContain("Capital");
  });

  it("renders YOU MISSED label on wrong, SKIPPED label on skip", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
      at: 0,
    };
    const game1 = makeGame({ feedback: wrong });
    const { rerender } = render(<ControlZone game={game1} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("You missed");
    expect(screen.getByRole("status").textContent).not.toContain("Skipped");

    const skipped: Feedback = {
      kind: "skipped",
      answerIso3: "",
      correctIso3: "FRA",
      at: 0,
    };
    const game2 = makeGame({ feedback: skipped });
    rerender(<ControlZone game={game2} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    expect(screen.getByRole("status").textContent).toContain("Skipped");
    expect(screen.getByRole("status").textContent).not.toContain("You missed");
  });

  it("affirms the country on a correct answer", () => {
    const correct: Feedback = {
      kind: "correct",
      answerIso3: "FRA",
      correctIso3: "FRA",
      at: 0,
    };
    const game = makeGame({ feedback: correct });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Correct");
    expect(status.textContent).toContain("France");
    // No Continue button — correct auto-advances on the timer.
    expect(screen.queryByRole("button", { name: /continue|got it/i })).toBeNull();
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
      capitalLonLat: [-65.26, -19.02],
      capitalAlternates: ["La Paz"],
      neighbors: [],
      sizeTier: 2,
      notabilityTier: 1,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "BOL",
      at: 0,
    };
    const game = makeGame({ current: bolivia, feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      capitalLonLat: [28.22, -25.7],
      capitalAlternates: ["Cape Town", "Bloemfontein"],
      neighbors: [],
      sizeTier: 2,
      notabilityTier: 2,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "ZAF",
      at: 0,
    };
    const game = makeGame({ current: southAfrica, feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      capitalLonLat: [27.48, -29.32],
      neighbors: ["ZAF"],
      sizeTier: 0,
      notabilityTier: 0,
    };
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "FRA",
      correctIso3: "LSO",
      at: 0,
    };
    const namesByIso3: Record<string, string> = {
      ...NAMES_BY_ISO3,
      LSO: "Lesotho",
      ZAF: "South Africa",
    };
    const game = makeGame({ current: lesotho, feedback: wrong });
    game.nameFromIso3 = (iso3) => namesByIso3[iso3] ?? iso3;
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
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
      capitalLonLat: [37.6, 55.75],
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
      at: 0,
    };
    const game = makeGame({ current: russia, feedback: wrong });
    game.nameFromIso3 = (iso3) => russiaNames[iso3] ?? iso3;
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    const status = screen.getByRole("status");
    // Alphabetical by display name. North Korea sorts under "N".
    expect(status.textContent).toContain(
      "Bordered by: Azerbaijan, Belarus, China, Estonia, Finland, Georgia, Kazakhstan, Latvia, Lithuania, Mongolia, North Korea, Norway, Poland, Ukraine",
    );
  });

  it("renders the AnswerInput only in shape-to-name mode", () => {
    const a = makeGame({ mode: "name-to-click" });
    const { rerender } = render(
      <ControlZone game={a} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />,
    );
    expect(screen.queryByPlaceholderText(/type the country name/i)).toBeNull();
    rerender(
      <ControlZone
        game={makeGame({ mode: "shape-to-name" })}
        showCaughtUp={false}
        onAckCaughtUp={() => {}}
       
        themePref="system"
        onSetThemePref={() => {}}
      />,
    );
    expect(screen.getByPlaceholderText(/type the country name/i)).toBeTruthy();
  });

  it("Study miss renders a 'Got it' dismiss button and no ease buttons", () => {
    const wrong: Feedback = {
      kind: "wrong",
      answerIso3: "DEU",
      correctIso3: "FRA",
      at: 0,
    };
    const game = makeGame({ practiceMode: "study", feedback: wrong });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    expect(screen.getByRole("button", { name: "Got it" })).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Grade" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Knew it|Forgot|Easy|Hard/ })).toBeNull();
  });

  it("Study correct flash renders no ease buttons and no dismiss button", () => {
    const correct: Feedback = {
      kind: "correct",
      answerIso3: "FRA",
      correctIso3: "FRA",
      at: 0,
    };
    const game = makeGame({ practiceMode: "study", feedback: correct });
    render(<ControlZone game={game} showCaughtUp={false} onAckCaughtUp={() => {}} themePref="system" onSetThemePref={() => {}} />);
    expect(screen.queryByRole("group", { name: "Grade" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Got it" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });
});

// ── R3.2: the capital modes ──────────────────────────────────────────────────

describe("ControlZone — capital modes", () => {
  const PERU: Country = {
    numeric: "604",
    iso3: "PER",
    name: "Peru",
    aliases: [],
    continent: "South America",
    subregion: "South America",
    capital: "Lima",
    capitalLonLat: [-77.03, -12.05],
    neighbors: ["BRA", "ECU"],
    sizeTier: 2,
    notabilityTier: 1,
  };

  function show(mode: QuestionMode, feedback: Feedback | null = null) {
    const game = makeGame({ mode, current: PERU, feedback });
    render(
      <ControlZone
        game={game}
        showCaughtUp={false}
        onAckCaughtUp={() => {}}
       
        themePref="system"
        onSetThemePref={() => {}}
      />,
    );
  }

  describe("the prompt", () => {
    it("Capital → Click asks for the country, showing the capital", () => {
      show("capital-to-click");
      expect(
        screen.getByText("Find the country whose capital is"),
      ).toBeDefined();
      expect(screen.getByText("Lima")).toBeDefined();
      // It is a click mode: no typing.
      expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("Country → Capital asks for the capital, showing the country", () => {
      show("country-to-capital");
      expect(screen.getByText("Capital of")).toBeDefined();
      expect(screen.getByText("Peru")).toBeDefined();
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.placeholder).toBe("Type the capital…");
    });

    it("a location typed mode still asks for the country name", () => {
      show("shape-to-name");
      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.placeholder).toBe("Type the country name…");
    });
  });

  describe("the reveal", () => {
    it("leads with the COUNTRY in Capital → Click, not the prompt's capital", () => {
      // The capital was the question. Echoing it back names nothing the
      // learner did not already have, and demotes the answer they missed.
      show("capital-to-click", {
        kind: "skipped",
        answerIso3: "",
        correctIso3: "PER",
        at: 0,
      });
      const status = screen.getByRole("status");
      expect(status.textContent).toMatch(/Skipped[\s\S]*Peru/);
      expect(status.textContent).toContain("Capital: Lima");
      expect(status.textContent).not.toContain("Capital of Peru");
    });

    it("names the country on a correct Capital → Click too", () => {
      show("capital-to-click", {
        kind: "correct",
        answerIso3: "PER",
        correctIso3: "PER",
        at: 0,
      });
      const status = screen.getByRole("status");
      expect(status.textContent).toMatch(/Correct[\s\S]*Peru/);
    });

    it("leads with the capital and names the country under it", () => {
      show("country-to-capital", {
        kind: "skipped",
        answerIso3: "",
        correctIso3: "PER",
        at: 0,
      });
      const status = screen.getByRole("status");
      expect(status.textContent).toMatch(/Skipped[\s\S]*Lima/);
      expect(status.textContent).toContain("Capital of Peru");
      // The elaborative neighbours line is kept.
      expect(status.textContent).toContain("Bordered by");
    });

    it("says where a wrong capital would have been right", () => {
      show("country-to-capital", {
        kind: "wrong",
        answerIso3: "ECU",
        correctIso3: "PER",
        at: 0,
      });
      expect(screen.getByRole("status").textContent).toContain(
        "That's the capital of Ecuador",
      );
    });

    it("says nothing extra when the typed capital is nobody's", () => {
      show("country-to-capital", {
        kind: "wrong",
        answerIso3: "",
        correctIso3: "PER",
        at: 0,
      });
      expect(screen.getByRole("status").textContent).not.toContain(
        "That's the capital of",
      );
    });

    it("names the country picked in Capital → Click, like any click mode", () => {
      show("capital-to-click", {
        kind: "wrong",
        answerIso3: "ECU",
        correctIso3: "PER",
        at: 0,
      });
      expect(screen.getByRole("status").textContent).toContain(
        "You picked: Ecuador",
      );
    });

    it("leads with the capital on a correct answer too", () => {
      show("country-to-capital", {
        kind: "correct",
        answerIso3: "PER",
        correctIso3: "PER",
        at: 0,
      });
      const status = screen.getByRole("status");
      expect(status.textContent).toMatch(/Correct[\s\S]*Lima/);
      expect(status.textContent).toContain("Capital of Peru");
    });
  });
});

describe("CaughtUp — the capitals offer", () => {
  function showCaughtUp(
    capitalOffer: { due: number; ready: number } | null,
    nextBack: string | null = null,
    newAvailableCount = 0,
  ) {
    const game = {
      ...makeGame({ practiceMode: "study" }),
      capitalOffer,
      nextBack,
      newAvailableCount,
    };
    render(
      <ControlZone
        game={game}
        showCaughtUp
        onAckCaughtUp={() => {}}
        themePref="system"
        onSetThemePref={() => {}}
      />,
    );
  }

  it("stops promising more when there is more, and offers it", () => {
    // The old line said "Come back later — we'll have more for you" at the one
    // moment there already was.
    showCaughtUp({ due: 0, ready: 12 });
    expect(screen.queryByText(/Come back later/)).toBeNull();
    expect(screen.getByText("Try capitals")).toBeDefined();
    expect(screen.getByText("12 countries you already know")).toBeDefined();
  });

  it("says they're back once capitals have been met and come round", () => {
    showCaughtUp({ due: 5, ready: 3 });
    expect(screen.getByText("Capitals are back")).toBeDefined();
    expect(screen.getByText("5 coming back")).toBeDefined();
  });

  it("keeps the old line when there is genuinely nothing else", () => {
    showCaughtUp(null);
    expect(screen.getByText(/Come back later/)).toBeDefined();
    expect(screen.queryByText("Try capitals")).toBeNull();
  });

  it("says when the next ones come back instead of 'come back later'", () => {
    showCaughtUp(null, "The next ones come back tomorrow");
    expect(screen.getByText("Nothing more has come back for now.")).toBeDefined();
    expect(screen.getByText("The next ones come back tomorrow.")).toBeDefined();
    expect(screen.queryByText(/Come back later/)).toBeNull();
  });

  it("says why unseen countries aren't next when the new cards are used up", () => {
    showCaughtUp(null, "The next ones come back tomorrow", 5);
    expect(
      screen.getByText(
        "No more new ones for now. The next ones come back tomorrow.",
      ),
    ).toBeDefined();
  });

  it("says when first, then offers capitals in the meantime", () => {
    showCaughtUp({ due: 0, ready: 4 }, "More come back later today");
    expect(
      screen.getByText(
        "More come back later today. Meanwhile, there's another way to know these places.",
      ),
    ).toBeDefined();
  });
});

describe("the Back again pill", () => {
  const withFrance = () =>
    storeWith({ FRA: grade(null, "Good", new Date("2026-09-13T12:00:00Z")) });

  function pill(overrides: Parameters<typeof makeGame>[0]) {
    render(
      <ControlZone
        game={makeGame(overrides)}
        showCaughtUp={false}
        onAckCaughtUp={() => {}}
       
        themePref="system"
        onSetThemePref={() => {}}
      />,
    );
    return screen.queryByText("Back again");
  }

  it("marks a Study card that has come back", () => {
    expect(
      pill({ practiceMode: "study", mode: "shape-to-name", srsStore: withFrance() }),
    ).not.toBeNull();
  });

  it("keeps it off the Name → Click prompt, where it would narrow the answer", () => {
    expect(
      pill({ practiceMode: "study", mode: "name-to-click", srsStore: withFrance() }),
    ).toBeNull();
  });

  it("marks the Name → Click answer instead, on a miss and on a correct flash", () => {
    for (const kind of ["wrong", "correct"] as const) {
      const feedback: Feedback = {
        kind,
        answerIso3: kind === "wrong" ? "DEU" : "FRA",
        correctIso3: "FRA",
        at: 0,
      };
      expect(
        pill({
          practiceMode: "study",
          mode: "name-to-click",
          srsStore: withFrance(),
          feedback,
        }),
      ).not.toBeNull();
      cleanup();
    }
  });

  it("leaves a card met for the first time unmarked", () => {
    expect(pill({ practiceMode: "study" })).toBeNull();
  });

  it("is not shown on an ordinary test card, even one with a record", () => {
    expect(pill({ practiceMode: "quiz", srsStore: withFrance() })).toBeNull();
  });

  it("marks every card of a test's retry pass", () => {
    expect(pill({ practiceMode: "quiz", phase: "review" })).not.toBeNull();
  });

  it("is not shown in an expedition", () => {
    expect(pill({ practiceMode: "expedition", srsStore: withFrance() })).toBeNull();
  });
});

describe("the focus chip", () => {
  function renderStudy(spotlightSubregion: Subregion | null) {
    const game = makeGame({ practiceMode: "study", spotlightSubregion });
    render(
      <ControlZone
        game={game}
        showCaughtUp={false}
        onAckCaughtUp={() => {}}
       
        themePref="system"
        onSetThemePref={() => {}}
      />,
    );
    return game;
  }

  it("offers a way out of a focus", () => {
    const game = renderStudy("Eastern Europe");
    fireEvent.click(
      screen.getByRole("button", { name: "Focus: Eastern Europe, stop" }),
    );
    expect(game.clearSpotlight).toHaveBeenCalledTimes(1);
  });

  it("is absent without one", () => {
    renderStudy(null);
    expect(screen.queryByRole("button", { name: /^Focus:/ })).toBeNull();
  });
});
