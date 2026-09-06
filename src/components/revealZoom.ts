// Pure geometry for the WorldMap reveal-zoom. Lives outside WorldMap.tsx
// so it can be exported (and unit-tested) without breaking React Fast
// Refresh, which expects component files to export only components.

export const W = 800;
export const H = 400;

export const MIN_ZOOM = 1;
// MAX_ZOOM picked to make the smallest countries comfortably clickable on
// mobile and let users pinch in past the auto-reveal frame to resolve
// dense label clusters (e.g. Hispaniola, the Baltics).
export const MAX_ZOOM = 48;
// Fraction of the smaller viewport dimension the framed bounds should
// occupy at the auto-computed reveal zoom — leaves ~45% padding around
// the focus so neighboring countries are visible for context.
const REVEAL_FIT_RATIO = 0.55;
// A neighbor is dropped from the reveal frame when pairing it with the answer
// country would shrink the fit below this fraction of the answer-alone fit —
// i.e. when framing the two together would collapse the answer to a speck.
// Mechanically this is a union-width test, so it catches a neighbor that's
// huge (Russia next to Estonia) OR far-flung — either balloons the union. For
// real land neighbors (always adjacent) it's effectively a size filter.
// Scale-invariant ratio, tuned by eye. The dropped neighbor stays highlighted
// and labeled; it's just not framed.
const REVEAL_NEIGHBOR_K_FLOOR = 0.3;
// R2.3: the reveal frame must keep some world around the answer, or the learner
// is shown a country floating in nothing and a neighbour's label can land off
// screen. So the fitted frame is pulled back by a fixed factor — the frame
// covers 1.8x the width and so 3.24x the area it otherwise would. Tuned by eye
// against Luxembourg (the tightest reveal in the table), Guyana and Brazil.
//
// Deliberately NOT the answer's UN subregion, which reads like the better rule
// and is not: subregions vary from the Baltics to the whole of South America,
// and capping at "South America" turns a Guyana reveal into the world view.
const REVEAL_CONTEXT_PULLBACK = 1.8;
// ...except where pulling back that far would leave the answer unfindable. The
// answer country's longer axis must still cover this fraction of the map's
// short axis. Expressed against the projection rather than the screen so the
// reveal frames identically at every viewport size.
//
// Whether it binds depends on the *fitted* frame, not on the country's own
// size: a small country with large neighbours is already framed wide, so the
// pull-back would take it under. It binds today for Ecuador, Uganda and
// Kosovo, and will bind far more often once release three brings in the
// micro-states.
const REVEAL_ANSWER_MIN_H_RATIO = 0.07;

export type Bounds = { x0: number; y0: number; x1: number; y1: number };
export type Target = { k: number; cx: number; cy: number };

// Merge a non-empty list of bounds into their union bounding box.
function unionBounds(bounds: readonly Bounds[]): Bounds {
  let { x0, y0, x1, y1 } = bounds[0];
  for (let i = 1; i < bounds.length; i++) {
    const b = bounds[i];
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  return { x0, y0, x1, y1 };
}

// Raw fit zoom for a bounding box — REVEAL_FIT_RATIO * min(W/w, H/h) with
// NO MIN_ZOOM gate and NO MAX_ZOOM clamp. The neighbor filter compares raw
// ratios, so clamping would distort the comparison for tiny primaries whose
// solo fit already exceeds MAX_ZOOM. Takes a pre-merged box so callers union
// once (e.g. tryFitUnion below) rather than re-merging here.
function naturalK(b: Bounds): number {
  const w = Math.max(1, b.x1 - b.x0);
  const h = Math.max(1, b.y1 - b.y0);
  return REVEAL_FIT_RATIO * Math.min(W / w, H / h);
}

// Try to fit a union of bounds within the viewport at a meaningful zoom.
// Returns null if the union is too wide (naturalK < MIN_ZOOM) so the caller
// can fall back to a tighter frame.
export function tryFitUnion(bounds: readonly Bounds[]): Target | null {
  if (bounds.length === 0) return null;
  const u = unionBounds(bounds);
  const k = naturalK(u);
  if (k < MIN_ZOOM) return null;
  return {
    k: Math.min(MAX_ZOOM, k),
    cx: (u.x0 + u.x1) / 2,
    cy: (u.y0 + u.y1) / 2,
  };
}

// The tightest zoom at which the answer country still reads: its longer axis
// covering REVEAL_ANSWER_MIN_H_RATIO of the map's short axis.
function minLegibleK(primary: Bounds): number {
  // Guards a degenerate box only. Deliberately not naturalK's `Math.max(1, …)`
  // floor, which would treat a sub-unit micro-state as a whole projection unit
  // wide and so under-estimate the zoom it needs.
  const longest = Math.max(
    1e-6,
    primary.x1 - primary.x0,
    primary.y1 - primary.y0,
  );
  return (REVEAL_ANSWER_MIN_H_RATIO * H) / longest;
}

// Pull `target` back from the tight fit so the answer is shown in a world
// rather than alone. Only `k` moves; the centre is left exactly as
// computeRevealTarget chose it (the union of the answer and whatever
// neighbours survived the filter), so widening can only ever add to what was
// visible. Never zooms in: the result is capped by the target it was given.
//
// Three floors stop it going too far: `restingK`, the frame the map sits at
// when nothing is being revealed — pulling back past that would zoom out of
// the learner's own continent filter and straight back in; MIN_ZOOM, the whole
// map; and minLegibleK, the answer staying findable.
export function widenForContext(
  target: Target,
  primary: Bounds,
  restingK: number = MIN_ZOOM,
): Target {
  const widened = Math.max(
    MIN_ZOOM,
    restingK,
    target.k / REVEAL_CONTEXT_PULLBACK,
    minLegibleK(primary),
  );
  return { ...target, k: Math.min(target.k, widened) };
}

// Given the focus country's bounds, the wrong-clicked country (if any), and
// the focus country's neighbors (for M2 elaborative encoding), return the
// {k, cx, cy} the effect should aim the d3-zoom transform at.
//
// Giant neighbors are filtered out FIRST (a neighbor whose inclusion would drop
// the fit below REVEAL_NEIGHBOR_K_FLOOR of the answer-alone fit — e.g. Russia
// next to Estonia — would collapse the answer to a speck). Survivors then go
// through the cascade: prefer the widest fit that still meets MIN_ZOOM. Drop the
// wrong-click first (e.g. user clicked Spain when the answer was New Caledonia —
// letting the answer collapse to a 3-pixel speck defeats the reveal), then drop
// neighbors if even primary+neighbors is too wide.
//
// The caller then passes the result through widenForContext, which pulls the
// frame back out so the answer is not shown alone.
export function computeRevealTarget(
  primary: Bounds,
  secondary: Bounds | null,
  neighbors: readonly Bounds[] = [],
): Target {
  // Each neighbor is judged independently against the answer-alone fit; the
  // combined survivors still go through the cascade (and its MIN_ZOOM backstop).
  const soloK = naturalK(primary);
  const kept = neighbors.filter(
    (n) => naturalK(unionBounds([primary, n])) >= REVEAL_NEIGHBOR_K_FLOOR * soloK,
  );
  const withSecondary = secondary ? [primary, secondary, ...kept] : [primary, ...kept];
  const fitAll = tryFitUnion(withSecondary);
  if (fitAll) return fitAll;
  if (secondary) {
    const fitWithoutSecondary = tryFitUnion([primary, ...kept]);
    if (fitWithoutSecondary) return fitWithoutSecondary;
  }
  if (kept.length > 0) {
    const fitPrimaryOnly = tryFitUnion([primary]);
    if (fitPrimaryOnly) return fitPrimaryOnly;
  }
  // Degenerate primary (shouldn't happen — every country has positive area
  // at 110m). Fall back to a centered identity-ish target. soloK is the
  // unclamped answer-alone fit computed above.
  return {
    k: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, soloK)),
    cx: (primary.x0 + primary.x1) / 2,
    cy: (primary.y0 + primary.y1) / 2,
  };
}
