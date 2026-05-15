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

type Bounds = { x0: number; y0: number; x1: number; y1: number };
type Target = { k: number; cx: number; cy: number };

// Try to fit a union of bounds within the viewport at a meaningful zoom.
// Returns null if the union is too wide (naturalK < MIN_ZOOM) so the caller
// can fall back to a tighter frame.
function tryFitUnion(bounds: readonly Bounds[]): Target | null {
  if (bounds.length === 0) return null;
  let x0 = bounds[0].x0;
  let y0 = bounds[0].y0;
  let x1 = bounds[0].x1;
  let y1 = bounds[0].y1;
  for (let i = 1; i < bounds.length; i++) {
    const b = bounds[i];
    if (b.x0 < x0) x0 = b.x0;
    if (b.y0 < y0) y0 = b.y0;
    if (b.x1 > x1) x1 = b.x1;
    if (b.y1 > y1) y1 = b.y1;
  }
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const naturalK = REVEAL_FIT_RATIO * Math.min(W / w, H / h);
  if (naturalK < MIN_ZOOM) return null;
  return {
    k: Math.min(MAX_ZOOM, naturalK),
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
  };
}

// Given the focus country's bounds, the wrong-clicked country (if any), and
// the focus country's neighbors (for M2 elaborative encoding), return the
// {k, cx, cy} the effect should aim the d3-zoom transform at.
//
// Cascade: prefer the widest fit that still meets MIN_ZOOM. Drop the
// wrong-click first (e.g. user clicked Spain when the answer was New
// Caledonia — letting the answer collapse to a 3-pixel speck defeats the
// reveal), then drop neighbors if even primary+neighbors is too wide
// (e.g. Russia + 14 neighbors).
export function computeRevealTarget(
  primary: Bounds,
  secondary: Bounds | null,
  neighbors: readonly Bounds[] = [],
): Target {
  const withSecondary = secondary ? [primary, secondary, ...neighbors] : [primary, ...neighbors];
  const fitAll = tryFitUnion(withSecondary);
  if (fitAll) return fitAll;
  if (secondary) {
    const fitWithoutSecondary = tryFitUnion([primary, ...neighbors]);
    if (fitWithoutSecondary) return fitWithoutSecondary;
  }
  if (neighbors.length > 0) {
    const fitPrimaryOnly = tryFitUnion([primary]);
    if (fitPrimaryOnly) return fitPrimaryOnly;
  }
  // Degenerate primary (shouldn't happen — every country has positive area
  // at 110m). Fall back to a centered identity-ish target.
  const w = Math.max(1, primary.x1 - primary.x0);
  const h = Math.max(1, primary.y1 - primary.y0);
  const naturalK = REVEAL_FIT_RATIO * Math.min(W / w, H / h);
  return {
    k: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, naturalK)),
    cx: (primary.x0 + primary.x1) / 2,
    cy: (primary.y0 + primary.y1) / 2,
  };
}
