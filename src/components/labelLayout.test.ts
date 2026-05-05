import { describe, expect, it } from "vitest";
import {
  computeVisibleLabels,
  fontSizeFor,
  GLYPH_W_RATIO,
  LABEL_EM,
  type Label,
  type Rect,
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
