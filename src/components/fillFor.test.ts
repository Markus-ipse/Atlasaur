import { describe, it, expect } from "vitest";
import type { Feedback } from "../types";
import {
  COLOR_CORRECT,
  COLOR_DEFAULT,
  COLOR_HIGHLIGHT,
  COLOR_INERT,
  COLOR_NEIGHBOR,
  COLOR_SKIPPED,
  COLOR_WRONG,
  fillFor,
} from "./fillFor";

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
      fillFor({
        iso3: "FRA",
        highlightedIso3: "FRA",
        feedback: wrong,
        inScope: true,
        neighborSet: FRANCE_NEIGHBORS,
      }),
    ).toBe(COLOR_CORRECT);
  });

  it("correct country shows yellow on a skip", () => {
    expect(
      fillFor({
        iso3: "FRA",
        highlightedIso3: null,
        feedback: skipped,
        inScope: true,
        neighborSet: FRANCE_NEIGHBORS,
      }),
    ).toBe(COLOR_SKIPPED);
  });

  it("wrong-clicked country that is ALSO a neighbor stays red, not blue", () => {
    // Case 6 from m2-followups: France answer, click Germany.
    expect(
      fillFor({
        iso3: "DEU",
        highlightedIso3: null,
        feedback: wrong,
        inScope: true,
        neighborSet: FRANCE_NEIGHBORS,
      }),
    ).toBe(COLOR_WRONG);
  });

  it("neighbor that is not the wrong-clicked country gets neighbor blue", () => {
    expect(
      fillFor({
        iso3: "BEL",
        highlightedIso3: null,
        feedback: wrong,
        inScope: true,
        neighborSet: FRANCE_NEIGHBORS,
      }),
    ).toBe(COLOR_NEIGHBOR);
  });

  it("neighbor blue overrides highlight during feedback", () => {
    expect(
      fillFor({
        iso3: "BEL",
        highlightedIso3: "BEL",
        feedback: wrong,
        inScope: true,
        neighborSet: FRANCE_NEIGHBORS,
      }),
    ).toBe(COLOR_NEIGHBOR);
  });

  it("on a correct answer, the answered country returns COLOR_CORRECT", () => {
    // Neighbor scoping for the "no neighbors on correct" rule happens at the
    // App.tsx layer (it passes an empty neighborSet on correct feedback), so
    // fillFor itself does not need to special-case this.
    expect(
      fillFor({
        iso3: "FRA",
        highlightedIso3: null,
        feedback: correct,
        inScope: true,
        neighborSet: NO_NEIGHBORS,
      }),
    ).toBe(COLOR_CORRECT);
  });
});

describe("fillFor — no feedback", () => {
  it("highlight wins when there is no feedback", () => {
    expect(
      fillFor({
        iso3: "FRA",
        highlightedIso3: "FRA",
        feedback: null,
        inScope: true,
        neighborSet: NO_NEIGHBORS,
      }),
    ).toBe(COLOR_HIGHLIGHT);
  });

  it("neighbor membership is ignored without feedback", () => {
    expect(
      fillFor({
        iso3: "BEL",
        highlightedIso3: null,
        feedback: null,
        inScope: true,
        neighborSet: FRANCE_NEIGHBORS,
      }),
    ).toBe(COLOR_DEFAULT);
  });

  it("out-of-scope returns inert", () => {
    expect(
      fillFor({
        iso3: "BEL",
        highlightedIso3: null,
        feedback: null,
        inScope: false,
        neighborSet: NO_NEIGHBORS,
      }),
    ).toBe(COLOR_INERT);
  });

  it("in-scope, unhighlighted, no feedback returns default", () => {
    expect(
      fillFor({
        iso3: "BEL",
        highlightedIso3: null,
        feedback: null,
        inScope: true,
        neighborSet: NO_NEIGHBORS,
      }),
    ).toBe(COLOR_DEFAULT);
  });
});

describe("fillFor — degenerate inputs", () => {
  it("undefined iso3 returns inert regardless of other args", () => {
    expect(
      fillFor({
        iso3: undefined,
        highlightedIso3: "FRA",
        feedback: wrong,
        inScope: true,
        neighborSet: FRANCE_NEIGHBORS,
      }),
    ).toBe(COLOR_INERT);
  });
});
