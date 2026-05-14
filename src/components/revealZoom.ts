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

// Given the focus country's bounds and optionally a second country to
// fit alongside it (the wrong-clicked one), return the {k, cx, cy} the
// effect should aim the d3-zoom transform at.
export function computeRevealTarget(
  primary: Bounds,
  secondary: Bounds | null,
): { k: number; cx: number; cy: number } {
  if (secondary) {
    const x0 = Math.min(primary.x0, secondary.x0);
    const y0 = Math.min(primary.y0, secondary.y0);
    const x1 = Math.max(primary.x1, secondary.x1);
    const y1 = Math.max(primary.y1, secondary.y1);
    const w = Math.max(1, x1 - x0);
    const h = Math.max(1, y1 - y0);
    const naturalK = REVEAL_FIT_RATIO * Math.min(W / w, H / h);
    if (naturalK >= MIN_ZOOM) {
      return {
        k: Math.min(MAX_ZOOM, naturalK),
        cx: (x0 + x1) / 2,
        cy: (y0 + y1) / 2,
      };
    }
    // Union is too wide to fit at any meaningful zoom (e.g. user clicked
    // Spain when the answer was New Caledonia). Falling back to a centered
    // world view would leave the answer country as a 3-pixel speck and
    // defeat the point of the reveal. Drop the secondary and frame the
    // answer country alone — the wrong country keeps its red fill in the
    // map, so the user can pan to find it if curious.
  }
  const w = Math.max(1, primary.x1 - primary.x0);
  const h = Math.max(1, primary.y1 - primary.y0);
  const naturalK = REVEAL_FIT_RATIO * Math.min(W / w, H / h);
  return {
    k: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, naturalK)),
    cx: (primary.x0 + primary.x1) / 2,
    cy: (primary.y0 + primary.y1) / 2,
  };
}
