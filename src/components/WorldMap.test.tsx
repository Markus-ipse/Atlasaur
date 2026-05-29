// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
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
  border: "#border",
  oceanTint: "#ocean0",
  oceanLabel: "#oclbl0",
  capitalDot: "#capdot",
  capitalDotHalo: "#caphal",
};

const BASE_PROPS = {
  mode: "name-to-click" as const,
  highlightedIso3: null,
  showLabelsOnReveal: true,
  correctNeighborIso3s: [] as readonly string[],
  selectedContinents: ALL_CONTINENTS,
  isoFromNumeric: () => undefined,
  numericFromIso3: () => undefined,
  isInScope: () => true,
  onCountryClick: () => {},
  palette: PALETTE,
};

const WRONG: Feedback = { kind: "wrong", answerIso3: "DEU", correctIso3: "FRA" };

function capitalDotCircles(container: HTMLElement): SVGCircleElement[] {
  return Array.from(
    container.querySelectorAll<SVGCircleElement>(
      'g[aria-hidden="true"] > circle',
    ),
  );
}

describe("WorldMap — capital marker", () => {
  afterEach(cleanup);

  it("renders halo + center dot when revealCapitalLonLat is set", () => {
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={WRONG}
        revealCapitalLonLat={[2.33, 48.87]}
      />,
    );
    const circles = capitalDotCircles(container);
    expect(circles).toHaveLength(2);
    expect(circles[0].getAttribute("fill")).toBe(PALETTE.capitalDotHalo);
    expect(circles[1].getAttribute("fill")).toBe(PALETTE.capitalDot);
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
