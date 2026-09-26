import { describe, expect, it } from "vitest";
import { mapKeyFor, type MapKeyInput } from "./mapKey";
import type { Palette } from "./fillFor";
import type { Feedback } from "../types";
import type { MasteryTier } from "../game/srs";

const PALETTE: Palette = {
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

const NONE = new Map<string, MasteryTier>();
const MET = new Map<string, MasteryTier>([
  ["FRA", 2],
  ["DEU", 1],
]);

function input(over: Partial<MapKeyInput> = {}): MapKeyInput {
  return {
    mode: "shape-to-name",
    feedback: null,
    highlightedIso3: null,
    neighborIso3s: [],
    spotlightIso3Set: new Set(),
    masteryByIso3: NONE,
    isInScope: () => true,
    scopeNarrowed: false,
    focusHidesProgress: false,
    palette: PALETTE,
    ...over,
  };
}

const ids = (over: Partial<MapKeyInput>) =>
  mapKeyFor(input(over)).entries.map((e) => e.id);

const WRONG: Feedback = { kind: "wrong", answerIso3: "DEU", correctIso3: "FRA", at: 0 };
const SKIPPED: Feedback = { kind: "skipped", answerIso3: "", correctIso3: "FRA", at: 0 };
const CORRECT: Feedback = { kind: "correct", answerIso3: "FRA", correctIso3: "FRA", at: 0 };

describe("mapKeyFor", () => {
  it("is empty on a first-day map with nothing to explain", () => {
    expect(ids({ mode: "name-to-click" })).toEqual([]);
  });

  it("names three tones once the map shows progress", () => {
    expect(ids({ masteryByIso3: MET })).toEqual(["unseen", "seen", "known"]);
  });

  it("names two tones in Name → Click, where the map collapses met into unseen", () => {
    expect(ids({ mode: "name-to-click", masteryByIso3: MET })).toEqual([
      "unseen",
      "known",
    ]);
    expect(
      mapKeyFor(input({ mode: "name-to-click", masteryByIso3: MET })).entries[0]
        .label,
    ).toBe("Not yet known");
  });

  it("shows no tones when the map paints none (a test, an expedition, Capital → Click)", () => {
    // paintTiers hands the map an empty map there; the key follows it.
    expect(ids({ mode: "capital-to-click", masteryByIso3: NONE })).toEqual([]);
  });

  it("ignores progress outside the scope, which the map draws inert", () => {
    expect(
      ids({ masteryByIso3: MET, isInScope: (iso3) => iso3 === "ESP" }),
    ).toEqual([]);
  });

  it("names the typed question's target while its question is up", () => {
    const key = mapKeyFor(
      input({ mode: "country-to-capital", highlightedIso3: "FRA" }),
    );
    expect(key.entries).toEqual([
      {
        id: "target",
        label: "The country in the question",
        fill: PALETTE.highlight,
        line: "solid",
      },
    ]);
  });

  it("does not name a target in a click mode", () => {
    expect(ids({ mode: "name-to-click", highlightedIso3: "FRA" })).toEqual([]);
  });

  it("names the inert land only when the selection leaves some out", () => {
    expect(ids({ scopeNarrowed: true })).toEqual(["inert"]);
  });

  it("names the land outside a focus instead of the inert land", () => {
    expect(
      ids({ spotlightIso3Set: new Set(["FRA"]), scopeNarrowed: true }),
    ).toEqual(["outside"]);
  });

  it("counts progress inside the focus only, since the rest is set back", () => {
    expect(
      ids({ masteryByIso3: MET, spotlightIso3Set: new Set(["ITA"]) }),
    ).toEqual(["outside"]);
    expect(
      ids({ masteryByIso3: MET, spotlightIso3Set: new Set(["FRA"]) }),
    ).toEqual(["unseen", "seen", "known", "outside"]);
  });

  it("says why a Name → Click focus shows no progress", () => {
    const key = mapKeyFor(
      input({
        mode: "name-to-click",
        spotlightIso3Set: new Set(["FRA"]),
        focusHidesProgress: true,
      }),
    );
    expect(key.entries.map((e) => e.id)).toEqual(["outside"]);
    expect(key.note).toMatch(/hidden while you focus/);
    expect(mapKeyFor(input()).note).toBeNull();
  });

  it("names only the reveal's colours during a miss", () => {
    expect(
      ids({
        feedback: WRONG,
        neighborIso3s: ["BEL", "LUX", "DEU"],
        masteryByIso3: MET,
        scopeNarrowed: true,
      }),
    ).toEqual(["answer", "wrong", "neighbor"]);
    const wrong = mapKeyFor(input({ feedback: WRONG })).entries[1];
    expect(wrong.line).toBe("dashed");
  });

  it("names no neighbours when the only one is the wrong pick, drawn red", () => {
    const PORTUGAL: Feedback = { kind: "wrong", answerIso3: "ESP", correctIso3: "PRT", at: 0 };
    expect(ids({ feedback: PORTUGAL, neighborIso3s: ["ESP"] })).toEqual([
      "answer",
      "wrong",
    ]);
  });

  it("names no pick on a skip, and no neighbours for an island", () => {
    expect(ids({ feedback: SKIPPED })).toEqual(["answer"]);
  });

  it("keeps the ambient entries through a correct flash", () => {
    expect(ids({ feedback: CORRECT, masteryByIso3: MET })).toEqual([
      "unseen",
      "seen",
      "known",
    ]);
  });
});
