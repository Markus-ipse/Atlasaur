import { describe, expect, it } from "vitest";
import { computeRevealTarget } from "./revealZoom";

const W = 800;
const H = 400;
const MIN_ZOOM = 1;
const MAX_ZOOM = 48;
const REVEAL_FIT_RATIO = 0.55;

describe("computeRevealTarget", () => {
  it("frames a single country centered on its bounds", () => {
    const r = computeRevealTarget(
      { x0: 395, y0: 195, x1: 405, y1: 205 },
      null,
    );
    expect(r.cx).toBe(400);
    expect(r.cy).toBe(200);
    // 0.55 * min(800/10, 400/10) = 0.55 * 40 = 22
    expect(r.k).toBeCloseTo(REVEAL_FIT_RATIO * 40);
  });

  it("frames the union of two countries when they fit at a meaningful zoom", () => {
    const r = computeRevealTarget(
      { x0: 100, y0: 100, x1: 110, y1: 110 },
      { x0: 130, y0: 100, x1: 140, y1: 110 },
    );
    // Union: (100,100)-(140,110)
    expect(r.cx).toBe(120);
    expect(r.cy).toBe(105);
    // 0.55 * min(800/40, 400/10) = 0.55 * 20 = 11
    expect(r.k).toBeCloseTo(REVEAL_FIT_RATIO * 20);
  });

  it("falls back to primary alone when the union is too wide to fit", () => {
    const primary = { x0: 395, y0: 195, x1: 405, y1: 205 };
    const farSecondary = { x0: 0, y0: 0, x1: W, y1: H };
    expect(computeRevealTarget(primary, farSecondary)).toEqual(
      computeRevealTarget(primary, null),
    );
  });

  it("clamps zoom at MAX_ZOOM for tiny countries", () => {
    const r = computeRevealTarget(
      { x0: 400, y0: 200, x1: 401, y1: 201 },
      null,
    );
    expect(r.k).toBe(MAX_ZOOM);
  });

  it("clamps zoom at MIN_ZOOM when the primary spans the whole map", () => {
    const r = computeRevealTarget({ x0: 0, y0: 0, x1: W, y1: H }, null);
    expect(r.k).toBe(MIN_ZOOM);
  });

  // M2 — neighbor cascade.

  it("includes neighbors in the framed area when they fit alongside the primary", () => {
    const primary = { x0: 395, y0: 195, x1: 405, y1: 205 };
    const neighbors = [
      { x0: 385, y0: 195, x1: 395, y1: 205 },
      { x0: 405, y0: 195, x1: 415, y1: 205 },
    ];
    const withNeighbors = computeRevealTarget(primary, null, neighbors);
    const withoutNeighbors = computeRevealTarget(primary, null);
    // Symmetric neighbors → same center, looser zoom.
    expect(withNeighbors.cx).toBe(withoutNeighbors.cx);
    expect(withNeighbors.k).toBeLessThan(withoutNeighbors.k);
  });

  it("falls back to primary alone when primary+neighbors would be too wide", () => {
    const primary = { x0: 395, y0: 195, x1: 405, y1: 205 };
    const hugeNeighbor = { x0: 0, y0: 0, x1: W - 1, y1: H - 1 };
    const cascade = computeRevealTarget(primary, null, [hugeNeighbor]);
    expect(cascade).toEqual(computeRevealTarget(primary, null));
  });

  it("drops a far secondary but keeps neighbors when neighbors still fit", () => {
    const primary = { x0: 395, y0: 195, x1: 405, y1: 205 };
    const neighbors = [
      { x0: 385, y0: 195, x1: 395, y1: 205 },
      { x0: 405, y0: 195, x1: 415, y1: 205 },
    ];
    // Whole-map secondary collapses the full union below MIN_ZOOM, so the
    // cascade drops it and re-tries with primary+neighbors (which fit).
    const farSecondary = { x0: 0, y0: 0, x1: W, y1: H };
    const withSecondary = computeRevealTarget(primary, farSecondary, neighbors);
    expect(withSecondary).toEqual(computeRevealTarget(primary, null, neighbors));
  });

  it("empty neighbor list behaves identically to no neighbors", () => {
    const primary = { x0: 395, y0: 195, x1: 405, y1: 205 };
    expect(computeRevealTarget(primary, null, [])).toEqual(
      computeRevealTarget(primary, null),
    );
  });
});
