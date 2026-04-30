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
    x1: 1000,
    y0: 0,
    y1: 1000,
    bypassFit: true,
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

  it("hides a non-bypass label whose width exceeds the country's projected width", () => {
    const labels = [
      // Width: 6 chars * 8/1 * 0.55 = 26.4. Country width: 10. Hidden.
      makeLabel({
        numericId: "1",
        name: "France",
        x0: 0,
        x1: 10,
        bypassFit: false,
      }),
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

  it("renders a non-bypass label that fits inside the country", () => {
    const labels = [
      makeLabel({
        numericId: "1",
        name: "France",
        x0: 0,
        x1: 100,
        bypassFit: false,
      }),
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
      bypassFit: false,
    });
    const justOver = makeLabel({
      numericId: "2",
      name,
      x0: 0,
      x1: widthAt + 0.01,
      bypassFit: false,
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

  it("two bypassFit labels collide; the larger area wins", () => {
    const labels = [
      makeLabel({
        numericId: "1",
        name: "Tiny",
        cx: 100,
        cy: 100,
        bypassFit: true,
        area: 1,
      }),
      makeLabel({
        numericId: "2",
        name: "Big",
        cx: 102,
        cy: 100,
        bypassFit: true,
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

  it("fontSizeFor returns LABEL_EM / k", () => {
    expect(fontSizeFor(1)).toBe(LABEL_EM);
    expect(fontSizeFor(2)).toBe(LABEL_EM / 2);
    expect(fontSizeFor(8)).toBe(LABEL_EM / 8);
  });
});
