// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { WorldMap } from "./WorldMap";
import type { Palette } from "./fillFor";
import { ALL_CONTINENTS, type Feedback } from "../types";

const PALETTE: Palette = {
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

// FRA → "250" so the capital-dot bounds gate can resolve France's drawn
// geometry; everything else is unmapped (mirrors how unrelated countries
// don't matter for these assertions).
const FRA_NUMERIC = "250";
const numericFromIso3 = (iso3: string) =>
  iso3 === "FRA" ? FRA_NUMERIC : undefined;

const BASE_PROPS = {
  mode: "name-to-click" as const,
  highlightedIso3: null,
  showLabelsOnReveal: true,
  correctNeighborIso3s: [] as readonly string[],
  spotlightIso3Set: new Set<string>(),
  selectedContinents: ALL_CONTINENTS,
  isoFromNumeric: () => undefined,
  numericFromIso3,
  isInScope: () => true,
  onCountryClick: () => {},
  palette: PALETTE,
};

const WRONG: Feedback = { kind: "wrong", answerIso3: "DEU", correctIso3: "FRA" };

// Paris — comfortably inside France's drawn geometry.
const PARIS: [number, number] = [2.33, 48.87];
// Port Vila's longitude/latitude — far from France, i.e. outside the answer
// country's bounds. Stands in for a capital on an island the topology omits.
const OFF_GEOMETRY: [number, number] = [168.32, -17.73];

function capitalDotCircles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(
    container.querySelectorAll<SVGCircleElement>(
      'g[aria-hidden="true"] > circle',
    ),
  );
}

describe("WorldMap — capital marker", () => {
  afterEach(cleanup);

  it("renders halo + center dot when the capital is inside the answer country", () => {
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={WRONG}
        revealCapitalLonLat={PARIS}
      />,
    );
    const circles = capitalDotCircles(container);
    expect(circles).toHaveLength(2);
    expect(circles[0].getAttribute("fill")).toBe(PALETTE.capitalDotHalo);
    expect(circles[1].getAttribute("fill")).toBe(PALETTE.capitalDot);
  });

  it("omits the dot when the capital projects outside the answer country's drawn geometry", () => {
    // e.g. Vanuatu's Port Vila sits on an island the 110m topology omits, so
    // the dot would otherwise be stranded in open ocean far from the land.
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={WRONG}
        revealCapitalLonLat={OFF_GEOMETRY}
      />,
    );
    expect(capitalDotCircles(container)).toHaveLength(0);
  });

  it("renders no marker when revealCapitalLonLat is null", () => {
    // App.tsx passes null on correct feedback and on null-capital countries
    // (e.g. Antarctica). WorldMap's contract is just "render iff non-null".
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={WRONG}
        revealCapitalLonLat={null}
      />,
    );
    expect(capitalDotCircles(container)).toHaveLength(0);
  });

  it("renders no marker when feedback is null even if a coord is somehow passed", () => {
    // Defense-in-depth: the dot should track revealCapitalLonLat directly.
    // If feedback is null but the prop is set, the dot still appears — App.tsx
    // is responsible for nulling the prop when there's no active reveal.
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={null}
        revealCapitalLonLat={null}
      />,
    );
    expect(capitalDotCircles(container)).toHaveLength(0);
  });
});

describe("WorldMap — floating Correct! badge", () => {
  afterEach(cleanup);

  const CORRECT: Feedback = {
    kind: "correct",
    answerIso3: "FRA",
    correctIso3: "FRA",
  };
  // Make France's path clickable: the base fixture's isoFromNumeric returns
  // undefined for everything, which leaves every path inert (Boolean(iso3) is
  // false). Map FRA's numeric → "FRA" so clicking it sets the click point.
  const isoFromNumeric = (numeric: string) =>
    numeric === FRA_NUMERIC ? "FRA" : undefined;

  it("shows the badge after a correct click in name-to-click mode", () => {
    const { container, rerender } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
      />,
    );
    const fra = container.querySelector<SVGPathElement>(
      `path[data-numeric="${FRA_NUMERIC}"]`,
    );
    expect(fra).not.toBeNull();
    // A real click carries the position the badge needs; dispatch through the
    // path's handler (not the reducer) so clickPoint is actually set.
    fireEvent.click(fra!);
    expect(container.textContent).not.toContain("Correct!"); // no feedback yet

    rerender(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={CORRECT}
        revealCapitalLonLat={null}
      />,
    );
    expect(container.textContent).toContain("Correct!");
  });

  it("shows no badge on a correct answer in shape-to-name mode (no click point)", () => {
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        mode="shape-to-name"
        isoFromNumeric={isoFromNumeric}
        feedback={CORRECT}
        revealCapitalLonLat={null}
      />,
    );
    expect(container.textContent).not.toContain("Correct!");
  });
});
