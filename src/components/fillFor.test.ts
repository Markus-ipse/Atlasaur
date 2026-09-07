import { describe, it, expect } from "vitest";
import type { Feedback } from "../types";
import {
  BORDER_MIN_CONTRAST,
  contrastRatio,
  fillFor,
  strokeFor,
  type Palette,
} from "./fillFor";

// Distinct sentinel colors so a precedence bug shows up as a wrong return
// value. Real palette resolution lives in App.tsx via readPaletteFromCss.
const LIGHT_PALETTE: Palette = {
  masteryUnseen: "#unseen",
  masterySeen: "#seen00",
  masteryKnown: "#known0",
  inert: "#inert00",
  highlight: "#highlt",
  correct: "#correc",
  wrong: "#wrong0",
  skipped: "#skippd",
  neighbor: "#neighb",
  spotlight: "#spotlt",
  border: "#border",
  borderInverse: "#bordin",
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
    ).toBe(LIGHT_PALETTE.masteryUnseen);
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

  it("in-scope, unhighlighted, no feedback returns the unseen paint", () => {
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
    ).toBe(LIGHT_PALETTE.masteryUnseen);
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

describe("fillFor — ambient mastery paint", () => {
  const base = {
    iso3: "BEL",
    highlightedIso3: null,
    feedback: null,
    inScope: true,
    neighborSet: NO_NEIGHBORS,
  };

  it("paints each tier with its own pigment", () => {
    expect(fillFor({ ...base, masteryTier: 0 }, LIGHT_PALETTE)).toBe(
      LIGHT_PALETTE.masteryUnseen,
    );
    expect(fillFor({ ...base, masteryTier: 1 }, LIGHT_PALETTE)).toBe(
      LIGHT_PALETTE.masterySeen,
    );
    expect(fillFor({ ...base, masteryTier: 2 }, LIGHT_PALETTE)).toBe(
      LIGHT_PALETTE.masteryKnown,
    );
  });

  it("treats an omitted tier as unseen", () => {
    expect(fillFor(base, LIGHT_PALETTE)).toBe(LIGHT_PALETTE.masteryUnseen);
  });

  it("keeps out-of-scope inert even for a known country", () => {
    expect(
      fillFor({ ...base, inScope: false, masteryTier: 2 }, LIGHT_PALETTE),
    ).toBe(LIGHT_PALETTE.inert);
  });

  it("lets the spotlight wash win over the mastery paint", () => {
    expect(
      fillFor(
        { ...base, masteryTier: 2, spotlightSet: new Set(["BEL"]) },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.spotlight);
  });

  it("lets a reveal win over the mastery paint", () => {
    const reveal: Feedback = {
      kind: "wrong",
      answerIso3: "BEL",
      correctIso3: "FRA",
    };
    expect(
      fillFor({ ...base, masteryTier: 2, feedback: reveal }, LIGHT_PALETTE),
    ).toBe(LIGHT_PALETTE.wrong);
  });

  it("lets the shape-to-name highlight win over the mastery paint", () => {
    expect(
      fillFor(
        { ...base, masteryTier: 2, highlightedIso3: "BEL" },
        LIGHT_PALETTE,
      ),
    ).toBe(LIGHT_PALETTE.highlight);
  });
});

// --- strokeFor -------------------------------------------------------------
//
// These two palettes mirror the shipped tokens in src/index.css — the same
// kind of contract as the theme-color literals in index.html and the PWA
// manifest, and for the same reason: a test can't read a CSS variable out of
// a stylesheet Vitest never parses. Only the slots a country path can be
// filled with are needed, plus the two border inks. Keep them in step with
// @theme / [data-theme="dark"]; the point of the suite is that the pigments
// we actually ship stay legible against the line that draws them.

const LIGHT: Palette = {
  ...LIGHT_PALETTE,
  masteryUnseen: "#e3d9c0",
  masterySeen: "#d8c28d",
  masteryKnown: "#c0a271",
  inert: "#e3d2ad", // --color-parchment-shadow
  highlight: "#b08327", // --color-ochre
  correct: "#5d7e3e", // --color-sap-green
  wrong: "#b66556", // --color-vermillion-faded
  skipped: "#9a7a2a",
  neighbor: "#c5b791",
  spotlight: "#dcb45a",
  border: "#2b1f12",
  borderInverse: "#f0e2c4",
};

const DARK: Palette = {
  ...LIGHT_PALETTE,
  masteryUnseen: "#362b1c",
  masterySeen: "#4a3c26",
  masteryKnown: "#6b5732",
  inert: "#272118",
  highlight: "#d49a3a",
  correct: "#7d9a4c",
  wrong: "#a64634",
  skipped: "#c69a36",
  neighbor: "#8a7a4a",
  spotlight: "#8a6a2a",
  border: "#7a6440",
  borderInverse: "#14100a",
};

// Every Palette slot fillFor can hand back for a country path. The ocean,
// label and capital-marker slots are not fills, so they never reach strokeFor.
const COUNTRY_FILLS = [
  "masteryUnseen",
  "masterySeen",
  "masteryKnown",
  "inert",
  "highlight",
  "correct",
  "wrong",
  "skipped",
  "neighbor",
  "spotlight",
] as const satisfies readonly (keyof Palette)[];

describe("strokeFor — the engraved line", () => {
  it("leaves the light map on its single ink", () => {
    // Light's border is near-black and every fill is a parchment pigment, so
    // nothing there comes close enough to the ink to need the second one.
    for (const slot of COUNTRY_FILLS) {
      expect(strokeFor(LIGHT[slot], LIGHT)).toBe(LIGHT.border);
    }
  });

  it("keeps the ochre line where dark land still reads against it", () => {
    // Out-of-scope land and unseen in-scope land are the map at rest; the
    // ochre line is what draws them, and coastlines with it.
    for (const slot of ["inert", "masteryUnseen"] as const) {
      expect(strokeFor(DARK[slot], DARK)).toBe(DARK.border);
    }
  });

  it("switches ink for the dark fills that swallowed it", () => {
    // The reported bug: adjacent countries under the spotlight wash (or any
    // other bright pigment) read as one landmass.
    for (const slot of [
      "masteryKnown",
      "spotlight",
      "highlight",
      "correct",
      "wrong",
      "skipped",
      "neighbor",
    ] as const) {
      expect(strokeFor(DARK[slot], DARK)).toBe(DARK.borderInverse);
    }
  });

  it("clears the legibility floor wherever it switches", () => {
    for (const palette of [LIGHT, DARK]) {
      for (const slot of COUNTRY_FILLS) {
        const fill = palette[slot];
        const stroke = strokeFor(fill, palette);
        if (stroke === palette.border) continue;
        expect(contrastRatio(fill, stroke)).toBeGreaterThanOrEqual(
          BORDER_MIN_CONTRAST,
        );
      }
    }
  });

  it("never leaves a fill worse off than the default ink would", () => {
    // The floor holds the default ink through a marginal gain (light's sap
    // green would pick up 0.4 by switching, and doesn't) — but a switch can
    // only ever be an improvement, never a trade.
    for (const palette of [LIGHT, DARK]) {
      for (const slot of COUNTRY_FILLS) {
        const fill = palette[slot];
        expect(
          contrastRatio(fill, strokeFor(fill, palette))!,
        ).toBeGreaterThanOrEqual(contrastRatio(fill, palette.border)!);
      }
    }
  });

  it("answers per palette, so a theme flip can't serve a stale ink", () => {
    // Same fill string, both palettes — guards the memo key.
    const fill = DARK.spotlight;
    expect(strokeFor(fill, DARK)).toBe(DARK.borderInverse);
    expect(strokeFor(fill, { ...DARK, borderInverse: "" })).toBe(DARK.border);
  });

  it("falls back to the default ink on a color it can't read", () => {
    // Sentinel fixtures and a token that resolved empty under jsdom both
    // land here — a legibility check it can't make must not repaint the map.
    expect(strokeFor("#unseen", LIGHT_PALETTE)).toBe(LIGHT_PALETTE.border);
    expect(strokeFor(DARK.spotlight, { ...DARK, border: "" })).toBe("");
  });

  it("reads the rgb() form as well as hex", () => {
    const asRgb = { ...DARK, borderInverse: "rgb(20, 16, 10)" };
    expect(strokeFor(DARK.spotlight, asRgb)).toBe("rgb(20, 16, 10)");
  });

  it("reads a three-digit hex", () => {
    expect(contrastRatio("#fff", "#ffffff")).toBe(1);
  });
});
