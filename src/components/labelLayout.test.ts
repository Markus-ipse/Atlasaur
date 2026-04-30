import { describe, expect, it } from "vitest";
import {
  computeVisibleLabels,
  fontSizeFor,
  GLYPH_W_RATIO,
  LABEL_EM,
  type Label,
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

describe("computeVisibleLabels", () => {
  it("returns nothing when nothing is in scope and there's no correct answer", () => {
    const labels = [makeLabel({ numericId: "1", name: "A" })];
    expect(
      computeVisibleLabels(labels, {
        k: 1,
        isInScope: () => false,
        isoFromNumeric,
        correctIso3: null,
      }),
    ).toEqual([]);
  });

  it("renders the correct country even when out of scope", () => {
    const labels = [makeLabel({ numericId: "1", name: "A" })];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      isInScope: () => false,
      isoFromNumeric,
      correctIso3: "ISO_1",
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("A");
  });

  it("hides a label that doesn't fit the country at the current zoom", () => {
    // bw=20: "France" fits at moderate zoom (k=BYPASS_FIT_K=1.5: 17.6 < 20)
    // but not at low zoom (k=1: 26.4 > 20). Fit-check kicks in.
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    expect(
      computeVisibleLabels(labels, {
        k: 1,
        isInScope: allInScope,
        isoFromNumeric,
        correctIso3: null,
      }),
    ).toEqual([]);
  });

  it("shows the same label once zoomed in enough to fit it", () => {
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 2,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(visible).toHaveLength(1);
  });

  it("always shows a label whose country can never fit it (microstate path)", () => {
    // bw=2: "Liechtenstein" can't fit at any reasonable zoom. The
    // bypass-fit branch lets it through even at k=1.
    const labels = [
      makeLabel({ numericId: "1", name: "Liechtenstein", x0: 0, x1: 2 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
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
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
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
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    const reversed = computeVisibleLabels([big, small], {
      k: 1,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(ordered.map((l) => l.name)).toEqual(["Big"]);
    expect(reversed.map((l) => l.name)).toEqual(["Big"]);
  });

  it("renders the correct country even when its label overflows the country bounds", () => {
    // bw=20: "France" fits at moderate zoom but not at k=1 (26.4 > 20).
    // As the answer it must still render — the user needs to see it.
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      isInScope: () => false,
      isoFromNumeric,
      correctIso3: "ISO_1",
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("France");
  });

  it("places the correct country first even when smaller than competitors", () => {
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
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: "ISO_2",
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
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(visible).toHaveLength(2);
  });

  it("drops a label whose iso3 isn't resolvable", () => {
    const labels = [makeLabel({ numericId: "1", name: "A" })];
    expect(
      computeVisibleLabels(labels, {
        k: 1,
        isInScope: allInScope,
        isoFromNumeric: () => undefined,
        correctIso3: null,
      }),
    ).toEqual([]);
  });

  it("hides a label at the exact width-cutoff boundary (one char wider)", () => {
    // Width formula: name.length * fontSizeFor(k) * GLYPH_W_RATIO.
    // Pick a country bbox just shy of the width needed for an N-char name.
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
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(visible.map((l) => l.numericId)).toEqual(["2"]);
  });

  it("two microstate-sized labels collide; the larger area wins", () => {
    // Both x0/x1 are tiny — they bypass the fit-check via the moderate-
    // zoom rule, then collision rejection picks the larger area.
    const labels = [
      makeLabel({
        numericId: "1",
        name: "Tiny",
        cx: 100,
        cy: 100,
        x0: 99,
        x1: 101,
        area: 1,
      }),
      makeLabel({
        numericId: "2",
        name: "Big",
        cx: 102,
        cy: 100,
        x0: 101,
        x1: 103,
        area: 100,
      }),
    ];
    const visible = computeVisibleLabels(labels, {
      k: 1,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(visible.map((l) => l.numericId)).toEqual(["2"]);
  });

  it("padding pushes adjacent labels into a collision", () => {
    // Compute the exact width of "AB" at k=1 so the rect-touching case is
    // unambiguous. Without padding, two labels exactly width-apart would
    // touch but not overlap. The render-side pad should push them into a
    // collision.
    const k = 1;
    const fontSize = fontSizeFor(k);
    const w = 2 * fontSize * GLYPH_W_RATIO;
    const a = makeLabel({ numericId: "1", name: "AB", cx: 0, cy: 0, area: 10 });
    const b = makeLabel({ numericId: "2", name: "AB", cx: w, cy: 0, area: 1 });
    const visible = computeVisibleLabels([a, b], {
      k,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
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

  it("a larger em widens the bypass-fit threshold (mobile-em regression pin)", () => {
    // bw=20, "France" (6 chars). At desktop em=8, bypass-fit threshold
    // is 6 × 8/1.5 × 0.55 = 17.6 < 20 → not bypassed → fit-check applies
    // at k=1 (w=26.4 > 20) → hidden. At mobile em=25.6, bypass-fit
    // threshold is 6 × 25.6/1.5 × 0.55 = 56.3 > 20 → bypassed → label
    // is allowed through. This pins the runtime-em-aware bypass logic
    // so the static-precompute regression doesn't reappear.
    const labels = [
      makeLabel({ numericId: "1", name: "France", x0: 0, x1: 20 }),
    ];
    const desktop = computeVisibleLabels(labels, {
      k: 1,
      em: 8,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(desktop).toEqual([]);
    const mobile = computeVisibleLabels(labels, {
      k: 1,
      em: 25.6,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(mobile).toHaveLength(1);
  });

  it("a larger em widens the rect and tightens collision (mobile case)", () => {
    // Two labels far enough apart that they don't collide at em=8...
    const labels = [
      makeLabel({ numericId: "1", name: "AA", cx: 0, cy: 0, area: 10 }),
      makeLabel({ numericId: "2", name: "AA", cx: 14, cy: 0, area: 1 }),
    ];
    const desktop = computeVisibleLabels(labels, {
      k: 1,
      em: 8,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(desktop).toHaveLength(2);
    // ...but at mobile-scaled em the wider rects collide and the
    // smaller-area label gets dropped.
    const mobile = computeVisibleLabels(labels, {
      k: 1,
      em: 25.6,
      isInScope: allInScope,
      isoFromNumeric,
      correctIso3: null,
    });
    expect(mobile.map((l) => l.numericId)).toEqual(["1"]);
  });
});
