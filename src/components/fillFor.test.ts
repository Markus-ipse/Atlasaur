import { describe, it, expect } from "vitest";
import type { Feedback } from "../types";
import {
  BORDER_MIN_CONTRAST,
  contrastRatio,
  fillFor,
  paintFor,
  recede,
  RECEDE_FILL,
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
  neighbor: "#neighb",
  border: "#border",
  label: "#label0",
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

const wrong: Feedback = { kind: "wrong", answerIso3: "DEU", correctIso3: "FRA", at: 0 };
const skipped: Feedback = { kind: "skipped", answerIso3: "", correctIso3: "FRA", at: 0 };
const correct: Feedback = { kind: "correct", answerIso3: "FRA", correctIso3: "FRA", at: 0 };

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

  it("paints the answer green on a skip too — green only ever means the answer", () => {
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
    ).toBe(LIGHT_PALETTE.correct);
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

  it("neighbor that is not the wrong-clicked country gets the neighbor cue", () => {
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

  it("neighbor cue overrides highlight during feedback", () => {
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

// Written against the real light palette rather than the sentinels: recede
// can only mix colours it can read, and on a sentinel it hands the fill back
// unchanged, which would make "receded" indistinguishable from "painted".
describe("fillFor — a focus sets the rest of the map back", () => {
  const FOCUS: ReadonlySet<string> = new Set(["NGA", "GHA"]);
  const base = {
    highlightedIso3: null,
    feedback: null,
    inScope: true,
    neighborSet: NO_NEIGHBORS,
    spotlightSet: FOCUS,
  };

  it("keeps a focus country's own progress paint", () => {
    expect(
      fillFor({ ...base, iso3: "NGA", masteryTier: 2 }, LIGHT),
    ).toBe(LIGHT.masteryKnown);
  });

  it("recedes an in-scope country outside the focus", () => {
    const fill = fillFor({ ...base, iso3: "FRA", masteryTier: 2 }, LIGHT);
    expect(fill).toBe(recede(LIGHT.masteryKnown, LIGHT, RECEDE_FILL));
    expect(fill).not.toBe(LIGHT.masteryKnown);
  });

  it("leaves out-of-scope land inert", () => {
    expect(
      fillFor({ ...base, iso3: "FRA", inScope: false, masteryTier: 2 }, LIGHT),
    ).toBe(LIGHT.inert);
  });

  it("recedes nothing without a focus", () => {
    expect(
      fillFor(
        { ...base, iso3: "FRA", masteryTier: 2, spotlightSet: new Set() },
        LIGHT,
      ),
    ).toBe(LIGHT.masteryKnown);
  });

  it("loses to the highlight", () => {
    expect(
      fillFor({ ...base, iso3: "FRA", highlightedIso3: "FRA" }, LIGHT),
    ).toBe(LIGHT.highlight);
  });

  it("loses to a reveal for the countries it names, even outside the focus", () => {
    const reveal = { ...base, feedback: wrong, neighborSet: FRANCE_NEIGHBORS };
    expect(fillFor({ ...reveal, iso3: "FRA" }, LIGHT)).toBe(LIGHT.correct);
    expect(fillFor({ ...reveal, iso3: "DEU" }, LIGHT)).toBe(LIGHT.wrong);
    expect(fillFor({ ...reveal, iso3: "BEL" }, LIGHT)).toBe(LIGHT.neighbor);
  });

  it("stays on during a reveal for a country the reveal does not name", () => {
    expect(
      fillFor(
        { ...base, iso3: "JPN", feedback: wrong, neighborSet: FRANCE_NEIGHBORS },
        LIGHT,
      ),
    ).toBe(recede(LIGHT.masteryUnseen, LIGHT, RECEDE_FILL));
  });

  it("changes every ambient fill, in both themes", () => {
    for (const palette of [LIGHT, DARK]) {
      for (const slot of MASTERY) {
        const receded = recede(palette[slot], palette, RECEDE_FILL);
        expect(receded, slot).not.toBe(palette[slot]);
        expect(receded, slot).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("fades the line round a receded country, and keeps the focus's own", () => {
    // Unseen land barely moves when faded — it already sits a hair above the
    // ocean — so a focus reads mostly by which countries keep their lines.
    const outside = paintFor({ ...base, iso3: "FRA" }, LIGHT);
    expect(outside.stroke).not.toBe(strokeFor(outside.fill, LIGHT));
    const inside = paintFor({ ...base, iso3: "NGA" }, LIGHT);
    expect(inside.stroke).toBe(strokeFor(inside.fill, LIGHT));
    expect(paintFor({ ...base, iso3: "FRA", highlightedIso3: "FRA" }, LIGHT)).toEqual({
      fill: LIGHT.highlight,
      stroke: strokeFor(LIGHT.highlight, LIGHT),
    });
  });

  it("never lets known land outside a focus outshine unseen land inside it in dark", () => {
    // On the dark ocean brighter is louder: at a half-way fade Egypt drew the
    // eye away from every country of a Western Asia focus.
    const receded = recede(DARK.masteryKnown, DARK, RECEDE_FILL);
    expect(contrastRatio(receded, DARK.oceanTint)!).toBeLessThanOrEqual(
      contrastRatio(DARK.masteryUnseen, DARK.oceanTint)!,
    );
  });

  it("hands back a colour it cannot read unchanged", () => {
    expect(recede("#unseen", LIGHT, RECEDE_FILL)).toBe("#unseen");
    expect(recede(LIGHT.masteryKnown, { ...LIGHT, oceanTint: "" }, RECEDE_FILL)).toBe(
      LIGHT.masteryKnown,
    );
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

  it("lets a reveal win over the mastery paint", () => {
    const reveal: Feedback = {
      kind: "wrong",
      answerIso3: "BEL",
      correctIso3: "FRA",
      at: 0,
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
  highlight: "#3f6189", // --color-prussian-blue
  correct: "#5d7e3e", // --color-sap-green
  wrong: "#b66556", // --color-vermillion-faded
  neighbor: "#5a7d77",
  border: "#2b1f12",
  borderInverse: "#f0e2c4",
  label: "#2b1f12", // --color-map-label
  oceanTint: "#e6dec9",
};

const DARK: Palette = {
  ...LIGHT_PALETTE,
  masteryUnseen: "#362b1c",
  masterySeen: "#4a3c26",
  masteryKnown: "#6b5732",
  inert: "#272118",
  highlight: "#7fa3d4",
  correct: "#7d9a4c",
  wrong: "#a64634",
  neighbor: "#6ea8a0",
  border: "#967b4e",
  borderInverse: "#14100a",
  label: "#b89a6c",
  oceanTint: "#17130d",
};

const MASTERY = [
  "masteryUnseen",
  "masterySeen",
  "masteryKnown",
] as const satisfies readonly (keyof Palette)[];

// Every fill a country can wear at rest: the mastery ramp, the inert fill and
// the ramp set back by a focus. Named, so a failing floor says which.
function ambientFills(palette: Palette): [string, string][] {
  return [
    ...MASTERY.map((k): [string, string] => [k, palette[k]]),
    ["inert", palette.inert],
    ...MASTERY.map((k): [string, string] => [
      `receded ${k}`,
      recede(palette[k], palette, RECEDE_FILL),
    ]),
  ];
}

// Every Palette slot fillFor can hand back for a country path. The ocean,
// label and capital-marker slots are not fills, so they never reach strokeFor.
// A receded fill is mixed rather than a slot; `ambientFills` covers those.
const COUNTRY_FILLS = [
  ...MASTERY,
  "inert",
  "highlight",
  "correct",
  "wrong",
  "neighbor",
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
    // Out-of-scope land and unseen and met in-scope land are the map at rest;
    // the ochre line is what draws them, and coastlines with it.
    for (const slot of ["inert", "masteryUnseen", "masterySeen"] as const) {
      expect(strokeFor(DARK[slot], DARK)).toBe(DARK.border);
    }
  });

  it("switches ink for the dark fills that swallowed it", () => {
    // The reported bug: adjacent countries under a bright pigment read as
    // one landmass.
    for (const slot of [
      "masteryKnown",
      "highlight",
      "correct",
      "wrong",
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
      const fills = [
        ...COUNTRY_FILLS.map((slot) => palette[slot]),
        ...ambientFills(palette).map(([, fill]) => fill),
      ];
      for (const fill of fills) {
        expect(
          contrastRatio(fill, strokeFor(fill, palette))!,
        ).toBeGreaterThanOrEqual(contrastRatio(fill, palette.border)!);
      }
    }
  });

  it("answers per palette, so a theme flip can't serve a stale ink", () => {
    // Same fill string, both palettes — guards the memo key.
    const fill = DARK.masteryKnown;
    expect(strokeFor(fill, DARK)).toBe(DARK.borderInverse);
    expect(strokeFor(fill, { ...DARK, borderInverse: "" })).toBe(DARK.border);
  });

  it("falls back to the default ink on a color it can't read", () => {
    // Sentinel fixtures and a token that resolved empty under jsdom both
    // land here — a legibility check it can't make must not repaint the map.
    expect(strokeFor("#unseen", LIGHT_PALETTE)).toBe(LIGHT_PALETTE.border);
    expect(strokeFor(DARK.masteryKnown, { ...DARK, border: "" })).toBe("");
  });

  it("reads the rgb() form as well as hex", () => {
    const asRgb = { ...DARK, borderInverse: "rgb(20, 16, 10)" };
    expect(strokeFor(DARK.masteryKnown, asRgb)).toBe("rgb(20, 16, 10)");
  });

  it("reads a three-digit hex", () => {
    expect(contrastRatio("#fff", "#ffffff")).toBe(1);
  });
});

// Not a WCAG figure — fills, not text — but a floor that keeps a retune from
// sliding a cue back into the ramp. The old warm neighbour tone scored 1.02
// in light, the same paint as a known country.
const FILL_MIN_CONTRAST = 1.5;

describe("the neighbour cue against the ambient paint (R3.3a)", () => {
  // Every fill a neighbour can sit beside at rest: the whole mastery ramp
  // (the introduced wash is only collapsed in name-to-click), the inert
  // fill, the ramp receded by a focus.
  // The reveal's own fills (correct and wrong) are left out on purpose:
  // no tone clears both them and the ramp by luminance, and against them the
  // cue is carried by the frame and the label, not the fill alone.
  for (const [name, palette] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`stays clear of every ambient fill in ${name}`, () => {
      for (const [key, fill] of ambientFills(palette)) {
        expect(
          contrastRatio(palette.neighbor, fill),
          `neighbor vs ${key}`,
        ).toBeGreaterThanOrEqual(FILL_MIN_CONTRAST);
      }
    });
  }
});

describe("the typed question's target against the ambient paint (#62)", () => {
  // The target was ochre, inside the warm ramp, and read as one more tier of
  // progress. It is blue now; this keeps a retune from sliding it back. The
  // outline carries it too, so the fill is not the only cue.
  for (const [name, palette] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`stays clear of every ambient fill in ${name}`, () => {
      for (const [key, fill] of ambientFills(palette)) {
        expect(
          contrastRatio(palette.highlight, fill),
          `target vs ${key}`,
        ).toBeGreaterThanOrEqual(FILL_MIN_CONTRAST);
      }
    });
  }
});

describe("dark map legibility (#62)", () => {
  // Country names are text: WCAG AA against the ocean they sit on, halo and
  // all. Checked in light too, so a retune there cannot slip.
  const TEXT_MIN_CONTRAST = 4.5;
  // The coastline and the edge of the continent filter are the map's
  // non-text graphics: WCAG's 3:1.
  const LINE_MIN_CONTRAST = 3;

  for (const [name, palette] of [["light", LIGHT], ["dark", DARK]] as const) {
    it(`sets country names at text contrast on the ocean in ${name}`, () => {
      expect(
        contrastRatio(palette.label, palette.oceanTint),
      ).toBeGreaterThanOrEqual(TEXT_MIN_CONTRAST);
    });
  }

  it("draws dark coastlines and out-of-scope land at 3:1", () => {
    for (const key of ["oceanTint", "inert", "masteryUnseen"] as const) {
      expect(
        contrastRatio(DARK.border, DARK[key]),
        `border vs ${key}`,
      ).toBeGreaterThanOrEqual(LINE_MIN_CONTRAST);
    }
  });
});
