import { describe, expect, it } from "vitest";
import {
  computeVisibleLabels,
  fontSizeFor,
  COLLISION_PADDING,
  clipRingToRect,
  pinOffFrameLabels,
  GLYPH_W_RATIO,
  LABEL_EM,
  type Label,
  type Polygon,
  type Rect,
  type Ring,
} from "./labelLayout";

function makeLabel(partial: Partial<Label> & Pick<Label, "numericId" | "name">): Label {
  return {
    cx: 100,
    cy: 100,
    x0: 0,
    // Default bw=1000 so labels comfortably fit (no fit-check rejection)
    // unless tests override it.
    x1: 1000,
    y0: 0,
    y1: 1000,
    area: 1,
    ...partial,
  };
}

const isoFromNumeric = (n: string) => `ISO_${n}`;
const allInScope = () => true;
const noReveal: ReadonlySet<string> = new Set();

describe("computeVisibleLabels", () => {
  it("returns nothing when nothing is in scope and no reveal targets", () => {
    const labels = [makeLabel({ numericId: "1", name: "A" })];
    expect(
      computeVisibleLabels(labels, {
        k: 1,
        effectiveScale: 1,
        isInScope: () => false,
        isoFromNumeric,
        revealIso3s: noReveal,
      }),
    ).toEqual([]);
  });

  it("renders a reveal target even when out of scope", () => {
    const labels = [makeLabel({ numericId: "1", name: "A" })];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 1,
      isInScope: () => false,
      isoFromNumeric,
      revealIso3s: new Set(["ISO_1"]),
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("A");
  });

  it("hides a label that doesn't fit the country at the current zoom", () => {
    // bw=20, effectiveScale=2 → 40px on screen, above microstate threshold
    // (~23px). At k=1 with em=LABEL_EM=8, "France" width=26.4 > 20, so the
    // fit-check drops it.
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    expect(
      computeVisibleLabels(labels, {
        k: 1,
        effectiveScale: 2,
        isInScope: allInScope,
        isoFromNumeric,
        revealIso3s: noReveal,
      }),
    ).toEqual([]);
  });

  it("shows the same label once zoomed in enough to fit it", () => {
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 2,
      effectiveScale: 2,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible).toHaveLength(1);
  });

  it("always shows a label for a true microstate regardless of zoom (Liechtenstein-sized)", () => {
    // bw=0.5: below the absolute SVG microstate threshold. Bypass
    // triggers at any zoom or viewport, label is a candidate and
    // renders alone.
    const labels = [
      makeLabel({ numericId: "1", name: "Liechtenstein", x0: 0, x1: 0.5 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible).toHaveLength(1);
  });

  it("drops the smaller label when two overlap", () => {
    const labels = [
      makeLabel({ numericId: "1", name: "Big", cx: 100, cy: 100, area: 100 }),
      makeLabel({ numericId: "2", name: "Sml", cx: 102, cy: 100, area: 1 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible.map((l) => l.name)).toEqual(["Big"]);
  });

  it("priority by area is independent of input order", () => {
    const small = makeLabel({
      numericId: "1",
      name: "Sml",
      cx: 100,
      cy: 100,
      area: 1,
    });
    const big = makeLabel({
      numericId: "2",
      name: "Big",
      cx: 102,
      cy: 100,
      area: 100,
    });
    const ordered = computeVisibleLabels([small, big], {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    const reversed = computeVisibleLabels([big, small], {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(ordered.map((l) => l.name)).toEqual(["Big"]);
    expect(reversed.map((l) => l.name)).toEqual(["Big"]);
  });

  it("renders a reveal target even when its label overflows the country bounds", () => {
    // bw=20: "France" doesn't fit at any practical zoom — but as the
    // reveal target it must still render.
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 2,
      isInScope: () => false,
      isoFromNumeric,
      revealIso3s: new Set(["ISO_1"]),
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("France");
  });

  it("places the reveal target first even when smaller than competitors", () => {
    const big = makeLabel({
      numericId: "1",
      name: "BigCountry",
      cx: 100,
      cy: 100,
      area: 1000,
    });
    const tinyAnswer = makeLabel({
      numericId: "2",
      name: "Sml",
      cx: 102,
      cy: 100,
      area: 1,
    });
    const visible = computeVisibleLabels([big, tinyAnswer], {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: new Set(["ISO_2"]),
    });
    expect(visible.map((l) => l.name)).toEqual(["Sml"]);
  });

  it("returns both labels when they don't overlap", () => {
    const labels = [
      makeLabel({ numericId: "1", name: "A", cx: 0, cy: 0, area: 10 }),
      makeLabel({ numericId: "2", name: "B", cx: 200, cy: 200, area: 10 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible).toHaveLength(2);
  });

  it("drops a label whose iso3 isn't resolvable", () => {
    const labels = [makeLabel({ numericId: "1", name: "A" })];
    expect(
      computeVisibleLabels(labels, {
        k: 1,
        effectiveScale: 1,
        isInScope: allInScope,
        isoFromNumeric: () => undefined,
        revealIso3s: noReveal,
      }),
    ).toEqual([]);
  });

  it("hides a label at the exact width-cutoff boundary (one char wider)", () => {
    // Width formula: name.length * fontSizeFor(k) * GLYPH_W_RATIO.
    // Pick a country bbox just shy of the width needed for an N-char name.
    // Both bw values must be above the microstate threshold so the
    // fit-check actually applies.
    const k = 1;
    const fontSize = fontSizeFor(k);
    const name = "FRANCE";
    const widthAt = name.length * fontSize * GLYPH_W_RATIO;
    const justUnder = makeLabel({
      numericId: "1",
      name,
      x0: 0,
      x1: widthAt - 0.01,
    });
    const justOver = makeLabel({
      numericId: "2",
      name,
      x0: 0,
      x1: widthAt + 0.01,
      cx: 500, // place far away so it doesn't collide with #1
    });
    const visible = computeVisibleLabels([justUnder, justOver], {
      k,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible.map((l) => l.numericId)).toEqual(["2"]);
  });

  it("two microstate-sized labels collide; the larger area wins", () => {
    // Both bboxes are below TRUE_MICROSTATE_SVG — they bypass the fit-
    // check via the microstate rule, then collision rejection picks the
    // larger area.
    const labels = [
      makeLabel({
        numericId: "1",
        name: "Tiny",
        cx: 100,
        cy: 100,
        x0: 99.75,
        x1: 100.25,
        area: 1,
      }),
      makeLabel({
        numericId: "2",
        name: "Big",
        cx: 102,
        cy: 100,
        x0: 101.75,
        x1: 102.25,
        area: 100,
      }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible.map((l) => l.numericId)).toEqual(["2"]);
  });

  it("padding pushes adjacent labels into a collision", () => {
    // Without padding, two labels exactly width-apart would touch but not
    // overlap. The render-side pad should push them into a collision.
    const k = 1;
    const fontSize = fontSizeFor(k);
    const w = 2 * fontSize * GLYPH_W_RATIO;
    const a = makeLabel({ numericId: "1", name: "AB", cx: 0, cy: 0, area: 10 });
    const b = makeLabel({ numericId: "2", name: "AB", cx: w, cy: 0, area: 1 });
    const visible = computeVisibleLabels([a, b], {
      k,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible.map((l) => l.numericId)).toEqual(["1"]);
  });

  it("fontSizeFor returns LABEL_EM / k by default", () => {
    expect(fontSizeFor(1)).toBe(LABEL_EM);
    expect(fontSizeFor(2)).toBe(LABEL_EM / 2);
    expect(fontSizeFor(8)).toBe(LABEL_EM / 8);
  });

  it("fontSizeFor honors a custom em (mobile-scaled labels)", () => {
    expect(fontSizeFor(1, 25.6)).toBe(25.6);
    expect(fontSizeFor(2, 25.6)).toBe(12.8);
  });

  it("high-zoom bypass renders labels that overflow their country (zoom-in regression pin)", () => {
    // Belgium-sized: bw=5 (above microstate threshold). At low zoom on
    // desktop the label is wider than the country and gets dropped;
    // once the user zooms past the high-zoom px-per-svg threshold the
    // bypass fires and the label renders even though it overflows.
    const labels = [
      makeLabel({ numericId: "1", name: "Belgium", x0: 0, x1: 5 }),
    ];
    const lowZoom = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(lowZoom).toEqual([]);
    const highZoom = computeVisibleLabels(labels, {
      k: 5,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(highZoom).toHaveLength(1);
  });

  it("high-zoom bypass kicks in at higher k on small screens (viewport-aware)", () => {
    // Same Belgium-sized country. On a mobile-like effectiveScale=0.5
    // it takes k>8 to trigger the bypass; on a desktop-like
    // effectiveScale=2.5 it takes only k>1.6.
    const labels = [
      makeLabel({ numericId: "1", name: "Belgium", x0: 0, x1: 5 }),
    ];
    const mobileBelowThreshold = computeVisibleLabels(labels, {
      k: 4,
      effectiveScale: 0.5,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(mobileBelowThreshold).toEqual([]);
    const mobileAboveThreshold = computeVisibleLabels(labels, {
      k: 12,
      effectiveScale: 0.5,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(mobileAboveThreshold).toHaveLength(1);
    const desktopAboveThreshold = computeVisibleLabels(labels, {
      k: 2,
      effectiveScale: 2.5,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(desktopAboveThreshold).toHaveLength(1);
  });

  it("a larger em widens the rect and tightens collision (mobile case)", () => {
    // Two labels far enough apart that they don't collide at em=8 with
    // the new padding...
    const labels = [
      makeLabel({ numericId: "1", name: "AA", cx: 0, cy: 0, area: 10 }),
      makeLabel({ numericId: "2", name: "AA", cx: 16, cy: 0, area: 1 }),
    ];
    const desktop = computeVisibleLabels(labels, {
      k: 1,
      em: 8,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(desktop).toHaveLength(2);
    // ...but at mobile-scaled em the wider rects collide and the
    // smaller-area label gets dropped.
    const mobile = computeVisibleLabels(labels, {
      k: 1,
      em: 25.6,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(mobile.map((l) => l.numericId)).toEqual(["1"]);
  });

  it("obstacles reject overlapping country candidates", () => {
    // A single country label centered at (100, 100) with a wide bbox.
    // Without an obstacle there it renders. Place an obstacle on top of
    // its center and it gets rejected.
    const labels = [makeLabel({ numericId: "1", name: "Spain", cx: 100, cy: 100 })];
    const baseArgs = {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    } as const;
    expect(
      computeVisibleLabels(labels, baseArgs).map((l) => l.name),
    ).toEqual(["Spain"]);
    const blocking: Rect = { x0: 80, x1: 120, y0: 90, y1: 110 };
    expect(
      computeVisibleLabels(labels, {
        ...baseArgs,
        obstacles: [blocking],
      }),
    ).toEqual([]);
  });

  it("reveal targets render even when an obstacle covers them", () => {
    const labels = [makeLabel({ numericId: "1", name: "Spain", cx: 100, cy: 100 })];
    const blocking: Rect = { x0: 80, x1: 120, y0: 90, y1: 110 };
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: new Set(["ISO_1"]),
      obstacles: [blocking],
    });
    expect(visible.map((l) => l.name)).toEqual(["Spain"]);
  });

  it("two reveal targets both render even if they'd collide with each other", () => {
    const a = makeLabel({ numericId: "1", name: "Aaa", cx: 100, cy: 100, area: 1 });
    const b = makeLabel({ numericId: "2", name: "Bbb", cx: 102, cy: 100, area: 1 });
    const visible = computeVisibleLabels([a, b], {
      k: 1,
      effectiveScale: 1,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: new Set(["ISO_1", "ISO_2"]),
    });
    expect(visible.map((l) => l.numericId).sort()).toEqual(["1", "2"]);
  });

  it("effectiveScale=0 falls back to legacy em-relative bypass (initial-render regression pin)", () => {
    // At first paint effectiveScale is 0. The legacy em-relative bypass
    // takes over so country-size logic still applies sensibly with the
    // default LABEL_EM. bw=20 with em=LABEL_EM=8: legacy bypass threshold
    // is 6 * (8/1.5) * 0.55 ≈ 17.6, less than 20, so no bypass; fit-check
    // (26.4 > 20) drops "France".
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      effectiveScale: 0,
      isInScope: allInScope,
      isoFromNumeric,
      revealIso3s: noReveal,
    });
    expect(visible).toEqual([]);
  });
});

describe("clipRingToRect", () => {
  const box: Rect = { x0: 0, y0: 0, x1: 10, y1: 10 };
  it("returns a ring wholly inside the window unchanged", () => {
    const ring: Ring = [[2, 2], [8, 2], [8, 8], [2, 8]];
    expect(clipRingToRect(ring, box)).toEqual(ring);
  });
  it("cuts a ring that crosses the window to the part inside", () => {
    const ring: Ring = [[5, 5], [15, 5], [15, 15], [5, 15]];
    const out = clipRingToRect(ring, box);
    expect(out).toHaveLength(4);
    for (const [x, y] of out) {
      expect(x).toBeGreaterThanOrEqual(5);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(5);
      expect(y).toBeLessThanOrEqual(10);
    }
  });
  it("returns nothing for a ring outside the window", () => {
    expect(clipRingToRect([[20, 20], [30, 20], [30, 30]], box)).toEqual([]);
  });
});

describe("pinOffFrameLabels (R3.3a)", () => {
  const k = 4;
  const fontSize = fontSizeFor(k, LABEL_EM);
  const pad = fontSize * COLLISION_PADDING;
  const halfW = (name: string) => (name.length * fontSize * GLYPH_W_RATIO) / 2 + pad;
  const halfH = fontSize / 2 + pad;
  const frame: Rect = { x0: 100, y0: 100, x1: 300, y1: 200 };
  // "1" is the answer, "2" and "3" its neighbours, "4" a wrong click.
  const revealSet = new Set(["1", "2", "3", "4"]);
  const isReveal = (n: string) => revealSet.has(n);
  const mayPin = (n: string) => n !== "1";
  const near: [number, number] = [150, 180];
  // The giant "2" is a big square whose south-west corner reaches into the
  // frame's north-east; its anchor is far outside.
  const GIANT_RING: Ring = [[250, -400], [900, -400], [900, 150], [250, 150]];
  const polygons: Record<string, Polygon[]> = { "2": [[GIANT_RING]] };
  const args = { frame, k, isReveal, mayPin, near, polygonsOf: (n: string) => polygons[n] ?? [] };
  const giant = () => makeLabel({ numericId: "2", name: "Russia", cx: 700, cy: -200, area: 1e6 });

  it("leaves a reveal label wholly inside the frame at its anchor", () => {
    const answer = makeLabel({ numericId: "1", name: "Estonia", cx: 200, cy: 150 });
    const [p] = pinOffFrameLabels([answer], args);
    expect(p).toMatchObject({ x: 200, y: 150, pinned: false });
  });

  it("moves an off-frame neighbour label onto its visible land, wholly inside the frame", () => {
    const answer = makeLabel({ numericId: "1", name: "Estonia", cx: 150, cy: 180 });
    const placed = pinOffFrameLabels([answer, giant()], args);
    const p = placed.find((q) => q.label.numericId === "2")!;
    expect(p.pinned).toBe(true);
    // On the visible piece of the giant (x ≥ 250, y ≤ 150) …
    expect(p.x).toBeGreaterThanOrEqual(250);
    expect(p.y).toBeLessThanOrEqual(150);
    // … and inset from the frame by the label's own extent.
    expect(p.x).toBeLessThanOrEqual(300 - halfW("Russia"));
    expect(p.y).toBeGreaterThanOrEqual(100 + halfH);
  });

  it("moves a neighbour whose anchor is inside the frame but whose label would spill out", () => {
    // Anchor a hair inside the top edge: the rect crosses it, so the label
    // is treated like any other off-frame one and lands on visible land.
    const edge = makeLabel({ numericId: "2", name: "Russia", cx: 275, cy: 100 + halfH / 2, area: 1e6 });
    const [p] = pinOffFrameLabels([edge], args);
    expect(p.pinned).toBe(true);
    expect(p.y).toBeGreaterThanOrEqual(100 + halfH);
  });

  it("drops a neighbour label when none of the neighbour is on screen", () => {
    const farRing: Ring = [[500, 500], [600, 500], [600, 600]];
    const placed = pinOffFrameLabels([giant()], { ...args, polygonsOf: () => [[farRing]] });
    expect(placed).toEqual([]);
  });

  it("drops a pinned label that would cover the answer and has nowhere on its land to go", () => {
    // The giant's only visible piece is a speck under the answer's label, so
    // no nudge can stay on the piece and clear the answer.
    const speck: Ring = [[270, 120], [280, 120], [280, 130], [270, 130]];
    const answer = makeLabel({ numericId: "1", name: "Estonia", cx: 275, cy: 125 });
    const placed = pinOffFrameLabels([answer, giant()], { ...args, polygonsOf: () => [[speck]] });
    expect(placed.map((p) => p.label.numericId)).toEqual(["1"]);
  });

  it("prefers the visible piece nearest the answer", () => {
    // Two pieces of the giant are visible; the smaller is next to the answer.
    const far: Ring = [[200, 100], [300, 100], [300, 140], [200, 140]];
    const nearAnswer: Ring = [[100, 170], [160, 170], [160, 200], [100, 200]];
    const answer = makeLabel({ numericId: "1", name: "Poland", cx: 130, cy: 160 });
    const placed = pinOffFrameLabels([answer, giant()], {
      ...args,
      near: [130, 160],
      polygonsOf: () => [[far], [nearAnswer]],
    });
    const p = placed.find((q) => q.label.numericId === "2")!;
    expect(p.pinned).toBe(true);
    expect(p.y).toBeGreaterThan(170);
  });

  it("takes another piece when the nearest one is under a fixed label with no room to nudge", () => {
    const far: Ring = [[200, 100], [300, 100], [300, 150], [200, 150]];
    const nearAnswer: Ring = [[125, 180], [135, 180], [135, 190], [125, 190]];
    // The answer's label covers the whole near piece.
    const answer = makeLabel({ numericId: "1", name: "Poland", cx: 130, cy: 185 });
    const placed = pinOffFrameLabels([answer, giant()], {
      ...args,
      near: [130, 185],
      polygonsOf: () => [[far], [nearAnswer]],
    });
    const p = placed.find((q) => q.label.numericId === "2")!;
    expect(p.pinned).toBe(true);
    expect(p.y).toBeLessThan(150);
  });

  it("nudges a label off a fixed label by the smallest separating step", () => {
    // The answer's label overlaps where the giant's pole would sit, by a
    // hair; the giant's label slides aside rather than being dropped.
    const answer = makeLabel({ numericId: "1", name: "Belarus", cx: 275 - halfW("Russia") - halfW("Belarus") + 0.2, cy: 125 });
    const placed = pinOffFrameLabels([answer, giant()], args);
    const p = placed.find((q) => q.label.numericId === "2")!;
    expect(p.pinned).toBe(true);
    expect(p.x).toBeGreaterThan(275);
    expect(p.x - 275).toBeLessThan(1);
  });

  it("keeps the label out of a hole", () => {
    // South Africa around Lesotho: the outer ring fills the frame, the hole
    // sits in the middle, exactly where the outer ring's pole would be.
    const outer: Ring = [[0, 0], [400, 0], [400, 300], [0, 300]];
    const hole: Ring = [[180, 130], [220, 130], [220, 170], [180, 170]];
    const [p] = pinOffFrameLabels([giant()], { ...args, polygonsOf: () => [[outer, hole]] });
    expect(p.pinned).toBe(true);
    const inHole = p.x > 180 && p.x < 220 && p.y > 130 && p.y < 170;
    expect(inHole).toBe(false);
  });

  it("lets a pinned label displace an ambient label at the same spot", () => {
    const ambient = makeLabel({ numericId: "9", name: "Latvia", cx: 275, cy: 125 });
    const placed = pinOffFrameLabels([ambient, giant()], args);
    expect(placed.map((p) => p.label.numericId)).toEqual(["2"]);
  });

  it("resolves two pinned labels on the same land by area", () => {
    const small = makeLabel({ numericId: "3", name: "Nepal", cx: 700, cy: -201, area: 10 });
    const placed = pinOffFrameLabels([small, giant()], {
      ...args,
      polygonsOf: () => [[GIANT_RING]],
    });
    expect(placed.map((p) => p.label.numericId)).toEqual(["2"]);
  });

  it("pins the wrong click onto its own visible land, and nowhere when it has none", () => {
    const sweden = makeLabel({ numericId: "4", name: "Sweden", cx: 700, cy: -200, area: 1e5 });
    const [onScreen] = pinOffFrameLabels([sweden], { ...args, polygonsOf: () => [[GIANT_RING]] });
    expect(onScreen.pinned).toBe(true);
    const farMiss = pinOffFrameLabels([sweden], { ...args, polygonsOf: () => [] });
    expect(farMiss).toEqual([]);
  });

  it("leaves an ambient label outside the frame where it is", () => {
    const ambient = makeLabel({ numericId: "9", name: "Latvia", cx: 700, cy: 20 });
    const [p] = pinOffFrameLabels([ambient], args);
    expect(p).toMatchObject({ x: 700, y: 20, pinned: false });
  });

  it("drops the label when the frame is narrower than the label", () => {
    const narrow: Rect = { x0: 100, y0: 100, x1: 101, y1: 200 };
    expect(pinOffFrameLabels([giant()], { ...args, frame: narrow })).toEqual([]);
  });
});
