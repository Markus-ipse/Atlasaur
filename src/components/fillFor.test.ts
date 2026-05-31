import { describe, it, expect } from "vitest";
import type { Feedback } from "../types";
import { fillFor, type Palette } from "./fillFor";

// Distinct sentinel colors so a precedence bug shows up as a wrong return
// value. Real palette resolution lives in App.tsx via readPaletteFromCss.
const LIGHT_PALETTE: Palette = {
  default: "#default",
  inert: "#inert00",
  highlight: "#highlt",
  correct: "#correc",
  wrong: "#wrong0",
  skipped: "#skippd",
  neighbor: "#neighb",
  spotlight: "#spotlt",
  border: "#border",
  oceanTint: "#ocean0",
  oceanLabel: "#oclbl0",
  capitalDot: "#capdot",
  capitalDotHalo: "#caphal",
};

const NO_NEIGHBORS: ReadonlySet<string> = new Set();
const FRANCE_NEIGHBORS: ReadonlySet<string> = new Set([
  "DEU",
  "BEL",
  "LUX",
  "CHE",
  "ITA",
  "ESP",
]);

const wrong: Feedback = { kind: "wrong", answerIso3: "DEU", correctIso3: "FRA" };
const skipped: Feedback = { kind: "skipped", answerIso3: "", correctIso3: "FRA" };
const correct: Feedback = { kind: "correct", answerIso3: "FRA", correctIso3: "FRA" };

describe("fillFor — precedence", () => {
  it("correct country wins over neighbor and highlight (wrong feedback)", () => {
    expect(
      fillFor(
        {
          iso3: "FRA",
          highlightedIso3: "FRA",
          feedback: wrong,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.correct);
  });

  it("correct country shows yellow on a skip", () => {
    expect(
      fillFor(
        {
          iso3: "FRA",
          highlightedIso3: null,
          feedback: skipped,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.skipped);
  });

  it("wrong-clicked country that is ALSO a neighbor stays red, not blue", () => {
    // Case 6 from m2-followups: France answer, click Germany.
    expect(
      fillFor(
        {
          iso3: "DEU",
          highlightedIso3: null,
          feedback: wrong,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.wrong);
  });

  it("neighbor that is not the wrong-clicked country gets neighbor blue", () => {
    expect(
      fillFor(
        {
          iso3: "BEL",
          highlightedIso3: null,
          feedback: wrong,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.neighbor);
  });

  it("neighbor blue overrides highlight during feedback", () => {
    expect(
      fillFor(
        {
          iso3: "BEL",
          highlightedIso3: "BEL",
          feedback: wrong,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.neighbor);
  });

  it("on a correct answer, the answered country returns palette.correct", () => {
    // Neighbor scoping for the "no neighbors on correct" rule happens at the
    // App.tsx layer (it passes an empty neighborSet on correct feedback), so
    // fillFor itself does not need to special-case this.
    expect(
      fillFor(
        {
          iso3: "FRA",
          highlightedIso3: null,
          feedback: correct,
          inScope: true,
          neighborSet: NO_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.correct);
  });
});

describe("fillFor — no feedback", () => {
  it("highlight wins when there is no feedback", () => {
    expect(
      fillFor(
        {
          iso3: "FRA",
          highlightedIso3: "FRA",
          feedback: null,
          inScope: true,
          neighborSet: NO_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.highlight);
  });

  it("neighbor membership is ignored without feedback", () => {
    expect(
      fillFor(
        {
          iso3: "BEL",
          highlightedIso3: null,
          feedback: null,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.default);
  });

  it("out-of-scope returns inert", () => {
    expect(
      fillFor(
        {
          iso3: "BEL",
          highlightedIso3: null,
          feedback: null,
          inScope: false,
          neighborSet: NO_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.inert);
  });

  it("in-scope, unhighlighted, no feedback returns default", () => {
    expect(
      fillFor(
        {
          iso3: "BEL",
          highlightedIso3: null,
          feedback: null,
          inScope: true,
          neighborSet: NO_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.default);
  });
});

describe("fillFor — spotlight tint", () => {
  const SPOTLIGHT: ReadonlySet<string> = new Set(["NGA", "GHA"]);

  it("tints a spotlight country over the in-scope default", () => {
    expect(
      fillFor(
        {
          iso3: "NGA",
          highlightedIso3: null,
          feedback: null,
          inScope: true,
          neighborSet: NO_NEIGHBORS,
          spotlightSet: SPOTLIGHT,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.spotlight);
  });

  it("loses to highlight", () => {
    expect(
      fillFor(
        {
          iso3: "NGA",
          highlightedIso3: "NGA",
          feedback: null,
          inScope: true,
          neighborSet: NO_NEIGHBORS,
          spotlightSet: SPOTLIGHT,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.highlight);
  });

  it("loses to feedback states (correct/neighbor) for the involved countries", () => {
    // Correct country wins even if it's also in the spotlight set.
    expect(
      fillFor(
        {
          iso3: "FRA",
          highlightedIso3: null,
          feedback: wrong,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
          spotlightSet: new Set(["FRA"]),
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.correct);
    // A neighbor that's also spotlighted shows the neighbor cue. Use BEL
    // (a France neighbor that is NOT the wrong-clicked answer, which is DEU).
    expect(
      fillFor(
        {
          iso3: "BEL",
          highlightedIso3: null,
          feedback: wrong,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
          spotlightSet: new Set(["BEL"]),
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.neighbor);
  });

  it("stays ambient during a reveal for a country not involved in the feedback", () => {
    // ITA is in scope, spotlit, NOT the answer and NOT a France neighbor here.
    const noNeighbors: ReadonlySet<string> = new Set();
    expect(
      fillFor(
        {
          iso3: "ITA",
          highlightedIso3: null,
          feedback: wrong,
          inScope: true,
          neighborSet: noNeighbors,
          spotlightSet: new Set(["ITA"]),
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.spotlight);
  });
});

describe("fillFor — degenerate inputs", () => {
  it("undefined iso3 returns inert regardless of other args", () => {
    expect(
      fillFor(
        {
          iso3: undefined,
          highlightedIso3: "FRA",
          feedback: wrong,
          inScope: true,
          neighborSet: FRANCE_NEIGHBORS,
        },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.inert);
  });
});
