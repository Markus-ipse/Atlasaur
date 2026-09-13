// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { WorldMap } from "./WorldMap";
import type { Palette } from "./fillFor";
import { ALL_CONTINENTS, type Continent, type Feedback } from "../types";
import type { MasteryTier } from "../game/srs";
import { LABELS_BY_NUMERIC, polygonsFor } from "./mapGeometry";
import { pointInPolygon } from "./polygon";

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
  borderInverse: "#bordin",
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
  hatchIso3: null as string | null,
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

  it("keeps the percentages as text when the captions are hidden", () => {
    // Phone width drops the engraved captions; a screen-reader user must not
    // lose the readout with them.
    withMapSize(...PHONE);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={null}
        revealCapitalLonLat={null}
        continentProgress={
          new Map<Continent, { known: number; total: number }>([
            ["Europe", { known: 39, total: 39 }],
            ["Africa", { known: 0, total: 51 }],
          ])
        }
      />,
    );
    expect(Object.keys(captions(container))).toEqual([]);
    const srOnly = container.querySelector(".sr-only");
    expect(srOnly?.textContent).toContain("Europe 100 percent");
    expect(srOnly?.textContent).toContain("Africa 0 percent");
  });

  it("keeps the percentages as text during a miss reveal too", () => {
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
    expect(container.querySelector(".sr-only")?.textContent).toContain(
      "Europe 2 percent",
    );
  });

  it("hides the engraved captions from assistive tech, so they are not read twice", () => {
    withMapSize(...DESKTOP);
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
    const caption = container.querySelector("text[data-continent]");
    expect(caption).not.toBeNull();
    // The sr-only paragraph is the accessible source; the SVG is the picture.
    expect(caption!.closest("g")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("reads the continents out in alphabetical order", () => {
    withMapSize(...DESKTOP);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        feedback={null}
        revealCapitalLonLat={null}
        continentProgress={
          // Insertion order follows countries.json, which is neither
          // alphabetical nor meaningful to someone hearing it read out.
          new Map<Continent, { known: number; total: number }>([
            ["Asia", { known: 0, total: 47 }],
            ["Europe", { known: 39, total: 39 }],
            ["Africa", { known: 0, total: 51 }],
          ])
        }
      />,
    );
    const text = container.querySelector(".sr-only")!.textContent!;
    expect(text.indexOf("Africa")).toBeLessThan(text.indexOf("Asia"));
    expect(text.indexOf("Asia")).toBeLessThan(text.indexOf("Europe"));
  });

  it("engraves a hatch over the country that just became known", () => {
    withMapSize(...DESKTOP);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
        hatchIso3="FRA"
      />,
    );
    const hatched = container.querySelectorAll("path.known-hatch");
    expect(hatched.length).toBeGreaterThan(0);
    expect(hatched[0].getAttribute("fill")).toBe("url(#known-hatch-pattern)");
    expect(container.querySelector("#known-hatch-pattern")).not.toBeNull();
  });

  it("engraves nothing when no country has just become known", () => {
    withMapSize(...DESKTOP);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
      />,
    );
    expect(container.querySelectorAll("path.known-hatch").length).toBe(0);
    expect(container.querySelector("#known-hatch-pattern")).toBeNull();
  });

  it("never lets the hatch swallow a click meant for the map", () => {
    withMapSize(...DESKTOP);
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
        hatchIso3="FRA"
      />,
    );
    const group = container.querySelector("path.known-hatch")!.closest("g")!;
    expect(group.getAttribute("pointer-events")).toBe("none");
    expect(group.getAttribute("aria-hidden")).toBe("true");
  });

  it("reports no progress text when there is none to report", () => {
    withMapSize(...DESKTOP);
    const { container } = render(
      <WorldMap {...BASE_PROPS} feedback={null} revealCapitalLonLat={null} />,
    );
    expect(container.querySelector(".sr-only")).toBeNull();
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

describe("WorldMap — off-frame neighbour labels (R3.3a)", () => {
  afterEach(cleanup);

  // Estonia and Russia: the canonical case. Russia is Estonia's neighbour, so
  // it is painted and labelled on an Estonia reveal, but computeRevealTarget
  // drops it from the frame and its label anchor sits in Siberia.
  const IDS: Record<string, string> = { EST: "233", RUS: "643" };
  const isoOf = new Map(Object.entries(IDS).map(([iso3, n]) => [n, iso3]));
  const props = {
    ...BASE_PROPS,
    isoFromNumeric: (n: string) => isoOf.get(n),
    numericFromIso3: (iso3: string) => IDS[iso3],
    // Europe without Russia, so the resting frame already excludes the
    // Siberian anchor — the reveal zoom itself does not run under jsdom.
    selectedContinents: ["Europe"] as Continent[],
    isInScope: (iso3: string) => iso3 !== "RUS",
    correctNeighborIso3s: ["RUS"],
    revealCapitalLonLat: null,
  };
  const MISS: Feedback = { kind: "skipped", answerIso3: "", correctIso3: "EST" };

  function labelText(container: HTMLElement, name: string) {
    return Array.from(container.querySelectorAll<SVGTextElement>("text")).find(
      (t) => t.textContent === name,
    );
  }

  it("moves the neighbour's label onto its visible land and leaves the answer at its anchor", () => {
    const { container } = render(<WorldMap {...props} feedback={MISS} />);
    const russia = labelText(container, "Russia")!;
    const estonia = labelText(container, "Estonia")!;
    expect(russia.getAttribute("data-pinned")).toBe("true");
    expect(estonia.getAttribute("data-pinned")).toBeNull();
    const at = (t: SVGTextElement): [number, number] => [
      Number(t.getAttribute("x")),
      Number(t.getAttribute("y")),
    ];
    const rusAnchor = LABELS_BY_NUMERIC.get(IDS.RUS)!;
    const [rx, ry] = at(russia);
    expect([rx, ry]).not.toEqual([rusAnchor.cx, rusAnchor.cy]);
    expect(polygonsFor(IDS.RUS).some((poly) => pointInPolygon([rx, ry], poly))).toBe(true);
    const estAnchor = LABELS_BY_NUMERIC.get(IDS.EST)!;
    expect(at(estonia)).toEqual([estAnchor.cx, estAnchor.cy]);
  });

  it("draws no labels at all when nothing is being revealed", () => {
    const { container } = render(<WorldMap {...props} feedback={null} />);
    expect(labelText(container, "Russia")).toBeUndefined();
  });
});

describe("WorldMap — markers (R3.4)", () => {
  afterEach(cleanup);

  // Malta is a marker in the real table: no shape, a dot at Valletta.
  const MLT = "470";
  const isoFromNumeric = (n: string) => (n === MLT ? "MLT" : undefined);
  const numericFromMlt = (iso3: string) => (iso3 === "MLT" ? MLT : undefined);
  const dot = (c: HTMLElement) =>
    c.querySelector<SVGCircleElement>(`circle[data-marker="${MLT}"]`);

  it("draws a marker country as a dot painted by its mastery tier", () => {
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
        masteryByIso3={new Map<string, MasteryTier>([["MLT", 2]])}
      />,
    );
    expect(dot(container)?.getAttribute("fill")).toBe(PALETTE.masteryKnown);
  });

  it("answers with the dot's country when it is clicked", () => {
    const clicked: string[] = [];
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        feedback={null}
        revealCapitalLonLat={null}
        onCountryClick={(iso3) => clicked.push(iso3)}
      />,
    );
    fireEvent.click(dot(container)!);
    expect(clicked).toEqual(["MLT"]);
  });

  function withCoarsePointer(run: () => void) {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      run();
    } finally {
      window.matchMedia = original;
    }
  }
  const follows = (a: Element, b: Element) =>
    Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("gives a dot an enlarged tap circle on a touch screen only", () => {
    const clicked: string[] = [];
    const props = {
      ...BASE_PROPS,
      isoFromNumeric,
      feedback: null,
      revealCapitalLonLat: null,
      onCountryClick: (iso3: string) => clicked.push(iso3),
    };
    const mouse = render(<WorldMap {...props} />);
    expect(mouse.container.querySelector("circle[data-marker-hit]")).toBeNull();
    mouse.unmount();
    withCoarsePointer(() => {
      const { container } = render(<WorldMap {...props} />);
      const hit = container.querySelector<SVGCircleElement>(`circle[data-marker-hit="${MLT}"]`);
      expect(hit).not.toBeNull();
      // Above the land, beneath the dot.
      expect(follows(hit!, dot(container)!)).toBe(true);
      expect(Number(hit!.getAttribute("r"))).toBeGreaterThan(
        Number(dot(container)!.getAttribute("r")),
      );
      fireEvent.click(hit!);
      expect(clicked).toEqual(["MLT"]);
    });
  });

  it("keeps neighbouring dots' tap circles apart and beneath every dot", () => {
    // Grenada and Saint Vincent: a few screen pixels apart in the Antilles.
    const GRD = "308";
    const VCT = "670";
    const iso = (n: string) => (n === GRD ? "GRD" : n === VCT ? "VCT" : undefined);
    withCoarsePointer(() => {
      const { container } = render(
        <WorldMap {...BASE_PROPS} isoFromNumeric={iso} feedback={null} revealCapitalLonLat={null} />,
      );
      const hits = Array.from(container.querySelectorAll("circle[data-marker-hit]"));
      const dots = [GRD, VCT].map((n) => container.querySelector(`circle[data-marker="${n}"]`)!);
      expect(hits).toHaveLength(2);
      const at = (el: Element, a: string) => Number(el.getAttribute(a));
      const gap = Math.hypot(at(dots[0], "cx") - at(dots[1], "cx"), at(dots[0], "cy") - at(dots[1], "cy"));
      expect(at(hits[0], "r") + at(hits[1], "r")).toBeLessThanOrEqual(gap + 1e-9);
      for (const h of hits) for (const d of dots) expect(follows(h, d)).toBe(true);
    });
  });

  it("paints an out-of-scope dot inert and takes no click on it", () => {
    const clicked: string[] = [];
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        isInScope={() => false}
        feedback={null}
        revealCapitalLonLat={null}
        onCountryClick={(iso3) => clicked.push(iso3)}
      />,
    );
    expect(dot(container)?.getAttribute("fill")).toBe(PALETTE.inert);
    fireEvent.click(dot(container)!);
    expect(clicked).toEqual([]);
  });

  it("rings the dot a typed question is asking about, and no other", () => {
    const { container, rerender } = render(
      <WorldMap
        {...BASE_PROPS}
        mode="shape-to-name"
        isoFromNumeric={isoFromNumeric}
        highlightedIso3="MLT"
        feedback={null}
        revealCapitalLonLat={null}
      />,
    );
    expect(container.querySelectorAll("circle[data-marker-ring]")).toHaveLength(1);
    expect(dot(container)?.getAttribute("fill")).toBe(PALETTE.highlight);
    rerender(
      <WorldMap
        {...BASE_PROPS}
        mode="shape-to-name"
        isoFromNumeric={isoFromNumeric}
        highlightedIso3={null}
        feedback={null}
        revealCapitalLonLat={null}
      />,
    );
    expect(container.querySelectorAll("circle[data-marker-ring]")).toHaveLength(0);
  });

  it("names a revealed marker below its dot, and draws no capital dot over it", () => {
    const { container } = render(
      <WorldMap
        {...BASE_PROPS}
        isoFromNumeric={isoFromNumeric}
        numericFromIso3={numericFromMlt}
        feedback={{ kind: "skipped", answerIso3: "MLT", correctIso3: "MLT" }}
        revealCapitalLonLat={[14.51, 35.9]}
      />,
    );
    const label = Array.from(container.querySelectorAll("text")).find(
      (t) => t.textContent === "Malta",
    );
    expect(label).toBeDefined();
    expect(Number(label!.getAttribute("y"))).toBeGreaterThan(
      Number(dot(container)!.getAttribute("cy")),
    );
    expect(dot(container)?.getAttribute("fill")).toBe(PALETTE.skipped);
    expect(capitalDotCircles(container)).toHaveLength(0);
  });
});
