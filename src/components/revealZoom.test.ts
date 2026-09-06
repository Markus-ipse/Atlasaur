import { describe, expect, it } from "vitest";
import {
  computeRevealTarget,
  tryFitUnion,
  widenForContext,
  type Bounds,
} from "./revealZoom";

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

  // Case 5 from docs/plans/m2-followups.md: Russia has 14 land neighbors
  // sprawling across the northern hemisphere. The neighbor union spans the
  // whole map, so the cascade should drop it and frame Russia alone at a
  // readable scale. (prefers-reduced-motion is enforced at the WorldMap
  // effect layer, not in computeRevealTarget — out of scope here.)
  it("many wide-spread neighbors fall through to bare-primary framing (Russia)", () => {
    const primary = { x0: 350, y0: 80, x1: 600, y1: 180 };
    const wideSpread: Bounds[] = [];
    // 14 neighbors spread across the full map width and most of its height.
    for (let i = 0; i < 14; i++) {
      const x0 = (i * W) / 14;
      const x1 = x0 + 40;
      wideSpread.push({ x0, y0: 50, x1, y1: H - 50 });
    }
    expect(computeRevealTarget(primary, null, wideSpread)).toEqual(
      computeRevealTarget(primary, null),
    );
  });

  // The real bug: a small answer country (Estonia) bordering a giant (Russia).
  // The giant clears MIN_ZOOM when framed alongside the answer — so the old
  // cascade kept it and collapsed the answer to a speck — but it must be
  // dropped so the answer stays visible.
  it("drops a neighbor that clears MIN_ZOOM but would dwarf the answer (Estonia/Russia)", () => {
    const primary = { x0: 395, y0: 195, x1: 405, y1: 205 }; // ~speck, solo k≈22
    const giant = { x0: 405, y0: 195, x1: 655, y1: 205 };
    const unionFit = tryFitUnion([primary, giant]);
    // Framing both is a *valid* fit (≥ MIN_ZOOM) — that's why the old code used
    // it — yet it shrinks the answer far below the visibility floor.
    expect(unionFit).not.toBeNull();
    expect(unionFit!.k).toBeGreaterThan(MIN_ZOOM);
    const result = computeRevealTarget(primary, null, [giant]);
    // Giant dropped → answer framed alone, prominently.
    expect(result).toEqual(computeRevealTarget(primary, null));
    expect(result.k).toBeGreaterThan(unionFit!.k);
  });

  // Contrast / lower bracket of REVEAL_NEIGHBOR_K_FLOOR: a neighbor comparable
  // in size to the answer (Latvia) is kept and widens the frame.
  it("keeps a neighbor comparable in size to the answer (Estonia/Latvia)", () => {
    const primary = { x0: 395, y0: 195, x1: 405, y1: 205 };
    const sibling = { x0: 405, y0: 195, x1: 425, y1: 205 };
    const result = computeRevealTarget(primary, null, [sibling]);
    const alone = computeRevealTarget(primary, null);
    expect(result.k).toBeLessThan(alone.k);
  });

  // Both neighbors are giants (Mongolia between Russia and China) → neither
  // survives the filter → the answer is framed alone.
  it("frames the answer alone when every neighbor is a giant (Mongolia)", () => {
    const primary = { x0: 380, y0: 180, x1: 420, y1: 220 };
    const russia = { x0: 0, y0: 0, x1: 380, y1: H - 1 };
    const china = { x0: 420, y0: 0, x1: W - 1, y1: H - 1 };
    expect(computeRevealTarget(primary, null, [russia, china])).toEqual(
      computeRevealTarget(primary, null),
    );
  });
});

describe("tryFitUnion", () => {
  it("returns null for an empty bounds list", () => {
    expect(tryFitUnion([])).toBeNull();
  });

  it("fits a tight cluster at a meaningful zoom", () => {
    const r = tryFitUnion([
      { x0: 100, y0: 100, x1: 110, y1: 110 },
      { x0: 130, y0: 100, x1: 140, y1: 110 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.cx).toBe(120);
    expect(r!.cy).toBe(105);
    // 0.55 * min(800/40, 400/10) = 0.55 * 20 = 11
    expect(r!.k).toBeCloseTo(REVEAL_FIT_RATIO * 20);
    expect(r!.k).toBeGreaterThan(MIN_ZOOM);
  });

  it("returns null when the union spans the whole map (would zoom below MIN_ZOOM)", () => {
    // Antarctica-shape proxy: full-width, short-height strip.
    expect(
      tryFitUnion([{ x0: 0, y0: H - 20, x1: W, y1: H }]),
    ).toBeNull();
  });

  it("clamps zoom at MAX_ZOOM for a tiny single bound", () => {
    const r = tryFitUnion([{ x0: 400, y0: 200, x1: 401, y1: 201 }]);
    expect(r).not.toBeNull();
    expect(r!.k).toBe(MAX_ZOOM);
  });

  // The two-stage reveal uses a non-null result here as its trigger: a near
  // miss frames both countries (stage 1); a far-apart pair (union too wide,
  // null) skips stage 1 for a single smooth transition to the answer.
  it("returns null for a far-apart pair (the far-miss / skip-stage-1 signal)", () => {
    const clickedWest = { x0: 60, y0: 200, x1: 90, y1: 230 };
    const correctEast = { x0: 720, y0: 120, x1: 750, y1: 150 };
    expect(tryFitUnion([clickedWest, correctEast])).toBeNull();
  });
});

describe("widenForContext (R2.3)", () => {
  const PULLBACK = 1.8;
  const MIN_H_RATIO = 0.07;

  function fit(b: Bounds) {
    return computeRevealTarget(b, null);
  }
  function legibleK(longestAxis: number) {
    return (MIN_H_RATIO * H) / longestAxis;
  }

  it("pulls a fitted frame back by the context factor", () => {
    // A medium country: neither floor is anywhere near binding, so the
    // pull-back alone decides the frame.
    const medium: Bounds = { x0: 400, y0: 150, x1: 420, y1: 170 };
    const target = fit(medium);
    expect(target.k / PULLBACK).toBeGreaterThan(legibleK(20));
    expect(target.k / PULLBACK).toBeGreaterThan(MIN_ZOOM);
    const widened = widenForContext(target, medium);
    expect(widened.k).toBeCloseTo(target.k / PULLBACK, 10);
    // Centre is left exactly where computeRevealTarget put it, so widening
    // can only add to what was visible.
    expect(widened.cx).toBe(target.cx);
    expect(widened.cy).toBe(target.cy);
  });

  it("stops at the legibility floor when the full pull-back would pass it", () => {
    // The floor's real regime: MIN_ZOOM < floor < the frame we were handed.
    // A country reaches it when its neighbours have already widened the fit
    // well past its own — Ecuador, Uganda and Kosovo do in the current table.
    // Built as a literal Target rather than through computeRevealTarget,
    // because the giant-neighbour filter refuses to produce this shape from
    // synthetic bounds.
    const primary: Bounds = { x0: 400, y0: 200, x1: 415, y1: 215 };
    const target = { k: 3, cx: 407.5, cy: 207.5 };
    const floor = legibleK(15);
    expect(floor).toBeGreaterThan(MIN_ZOOM);
    expect(floor).toBeGreaterThan(target.k / PULLBACK); // the floor binds
    expect(floor).toBeLessThan(target.k); // and it still widens
    expect(widenForContext(target, primary).k).toBeCloseTo(floor, 10);
  });

  it("never widens past the frame it was given", () => {
    // A country so small that even its fitted frame is under the legibility
    // floor: there is nothing to spend on context, so nothing moves.
    const tiny: Bounds = { x0: 400, y0: 200, x1: 400.01, y1: 200.01 };
    const target = fit(tiny);
    expect(legibleK(0.01)).toBeGreaterThan(target.k); // floor is unreachable
    expect(widenForContext(target, tiny)).toEqual(target);
  });

  it("never widens past MIN_ZOOM, the whole map", () => {
    // A large answer fitted just above MIN_ZOOM: the pull-back would take it
    // below the map itself, so the MIN_ZOOM clamp is what stops it.
    const large: Bounds = { x0: 200, y0: 100, x1: 500, y1: 250 };
    const target = fit(large);
    expect(target.k).toBeGreaterThan(MIN_ZOOM);
    expect(target.k).toBeLessThan(MIN_ZOOM * PULLBACK); // clamp, not pull-back
    expect(widenForContext(target, large).k).toBe(MIN_ZOOM);
  });

  it("never widens past the frame the map already rests at", () => {
    // With a continent filter the map sits closer than MIN_ZOOM. Pulling back
    // past that would zoom out of the learner's own frame and straight back in.
    const medium: Bounds = { x0: 400, y0: 150, x1: 420, y1: 170 };
    const target = fit(medium);
    const restingK = target.k / 1.2; // closer than the full pull-back allows
    expect(restingK).toBeGreaterThan(target.k / PULLBACK);
    expect(widenForContext(target, medium, restingK).k).toBeCloseTo(restingK, 10);
  });

  it("ignores a resting frame that is wider than the pull-back anyway", () => {
    const medium: Bounds = { x0: 400, y0: 150, x1: 420, y1: 170 };
    const target = fit(medium);
    expect(widenForContext(target, medium, MIN_ZOOM)).toEqual(
      widenForContext(target, medium),
    );
  });

  it("shows the pull-back factor more world than the tight fit", () => {
    // The point of the item: a small country is no longer alone in frame.
    const medium: Bounds = { x0: 400, y0: 150, x1: 420, y1: 170 };
    const target = fit(medium);
    const widened = widenForContext(target, medium);
    expect(W / widened.k).toBeCloseTo((W / target.k) * PULLBACK, 8);
  });
});
