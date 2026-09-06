// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { WorldMap } from "./WorldMap";
import type { Palette } from "./fillFor";
import { ALL_CONTINENTS, type Continent, type Feedback } from "../types";
import type { MasteryTier } from "../game/srs";

const PALETTE: Palette = {
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
  correctNeighborIso3s: [] as readonly string[],
  targetIso3: null as string | null,
  spotlightIso3Set: new Set<string>(),
  selectedContinents: ALL_CONTINENTS,
  isoFromNumeric: () => undefined,
  numericFromIso3,
  isInScope: () => true,
  onCountryClick: () => {},
  masteryByIso3: new Map<string, MasteryTier>(),
  continentProgress: new Map<Continent, { known: number; total: number }>(),
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

describe("WorldMap — ambient mastery paint", () => {
  afterEach(cleanup);

  // jsdom never lays anything out, so the component's ResizeObserver never
  // reports a size and `effectiveScale` stays 0 — which suppresses the
  // continent captions by the legibility gate. Stand in an observer that
  // reports a fixed box so the caption tests exercise the real size path.
  // The SVG viewBox is 800x400 (see revealZoom.ts): 1600x800 is a desktop-
  // sized map, 390x700 a phone.
  let restoreResizeObserver: (() => void) | null = null;
  afterEach(() => {
    restoreResizeObserver?.();
    restoreResizeObserver = null;
  });

  function withMapSize(width: number, height: number) {
    const original = globalThis.ResizeObserver;
    class FakeResizeObserver {
      constructor(private cb: ResizeObserverCallback) {}
      observe(target: Element) {
        this.cb(
          [
            {
              target,
              contentRect: { width, height } as DOMRectReadOnly,
            } as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
    restoreResizeObserver = () => {
      globalThis.ResizeObserver = original;
    };
  }

  const DESKTOP = [1600, 800] as const;
  const PHONE = [390, 700] as const;

  const isoFromNumeric = (numeric: string) =>
    numeric === FRA_NUMERIC ? "FRA" : undefined;

  function franceFill(container: HTMLElement): string | null {
    return container
      .querySelector<SVGPathElement>(`path[data-numeric="${FRA_NUMERIC}"]`)
      ?.getAttribute("fill") ?? null;
  }

  function captions(container: HTMLElement): Record<string, string> {
    const out: Record<string, string> = {};
    for (const t of container.querySelectorAll<SVGTextElement>(
      "text[data-continent]",
    )) {
      out[t.getAttribute("data-continent")!] = t.getAttribute("data-percent")!;
    }
    return out;
  }

  it("paints a country by its mastery tier", () => {
    for (const [tier, expected] of [
      [0, PALETTE.masteryUnseen],
      [1, PALETTE.masterySeen],
      [2, PALETTE.masteryKnown],
    ] as const) {
      const { container } = render(
        <WorldMap
          {...BASE_PROPS}
          isoFromNumeric={isoFromNumeric}
          feedback={null}
          revealCapitalLonLat={null}
          masteryByIso3={new Map([["FRA", tier as MasteryTier]])}
        />,
      );
      expect(franceFill(container)).toBe(expected);
      cleanup();
    }
  });

  it("paints a country with no record as unseen", () => {
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
      />,
    );
    expect(franceFill(container)).toBe(PALETTE.masteryUnseen);
  });

  it("keeps a known country inert when it is out of scope", () => {
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        isInScope={() => false}
        feedback={null}
        revealCapitalLonLat={null}
        masteryByIso3={new Map<string, MasteryTier>([["FRA", 2]])}
      />,
    );
    expect(franceFill(container)).toBe(PALETTE.inert);
  });

  it("draws one percentage caption per reported continent", () => {
    withMapSize(...DESKTOP);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={null}
        revealCapitalLonLat={null}
        continentProgress={
          new Map<Continent, { known: number; total: number }>([
            ["Europe", { known: 39, total: 39 }],
            ["Africa", { known: 0, total: 51 }],
            ["Asia", { known: 12, total: 47 }],
          ])
        }
      />,
    );
    expect(captions(container)).toEqual({
      Europe: "100",
      Africa: "0",
      Asia: "25",
    });
  });

  it("hides the captions during a miss reveal so they do not fight the labels", () => {
    withMapSize(...DESKTOP);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={WRONG}
        revealCapitalLonLat={null}
        continentProgress={
          new Map<Continent, { known: number; total: number }>([
            ["Europe", { known: 1, total: 39 }],
          ])
        }
      />,
    );
    expect(Object.keys(captions(container))).toEqual([]);
  });

  it("hides the captions on a phone-width world view, where they would be illegible", () => {
    withMapSize(...PHONE);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={null}
        revealCapitalLonLat={null}
        continentProgress={
          new Map<Continent, { known: number; total: number }>([
            ["Europe", { known: 1, total: 39 }],
          ])
        }
      />,
    );
    expect(Object.keys(captions(container))).toEqual([]);
  });

  it("still paints the mastery tiers on a phone, where the captions are hidden", () => {
    withMapSize(...PHONE);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
        masteryByIso3={new Map<string, MasteryTier>([["FRA", 2]])}
      />,
    );
    expect(franceFill(container)).toBe(PALETTE.masteryKnown);
  });
});
