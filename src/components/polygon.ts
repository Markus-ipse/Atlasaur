// Planar polygon primitives in projection units. No labels, no projection,
// no game state — the pieces mapGeometry.ts (the map's rings) and
// labelLayout.ts (where a label may sit) both need.

export type Ring = [number, number][];
// An outer ring followed by its holes.
export type Polygon = Ring[];
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// Shoelace.
export function ringArea(ring: Ring): number {
  let a = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function ringBounds(ring: Ring): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

// The largest ring by area, or null for an empty list.
export function largestRing(rings: readonly Ring[]): { ring: Ring; area: number } | null {
  let best: { ring: Ring; area: number } | null = null;
  for (const ring of rings) {
    const area = ringArea(ring);
    if (!best || area > best.area) best = { ring, area };
  }
  return best;
}

// Ray casting.
export function pointInRing([x, y]: readonly [number, number], ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Inside the outer ring and outside every hole.
export function pointInPolygon(p: readonly [number, number], [outer, ...holes]: Polygon): boolean {
  return pointInRing(p, outer) && !holes.some((h) => pointInRing(p, h));
}

// Sutherland–Hodgman: clip a ring to an axis-aligned rectangle. Exact for a
// convex window, which a rectangle is. Returns [] when nothing survives. Two
// visible lobes of one concave ring come back as one ring joined along the
// window's edge; polylabel still lands inside the larger lobe.
export function clipRingToRect(ring: Ring, r: Rect): Ring {
  let out = clipAxis(ring, 0, r.x0, true);
  out = clipAxis(out, 0, r.x1, false);
  out = clipAxis(out, 1, r.y0, true);
  return clipAxis(out, 1, r.y1, false);
}

// One clip plane: keep the side of `bound` on `axis` that `keepAbove` says.
function clipAxis(ring: Ring, axis: 0 | 1, bound: number, keepAbove: boolean): Ring {
  if (ring.length === 0) return ring;
  const other = axis === 0 ? 1 : 0;
  const inside = (p: [number, number]) => (keepAbove ? p[axis] >= bound : p[axis] <= bound);
  const cross = (a: [number, number], b: [number, number]): [number, number] => {
    const t = (bound - a[axis]) / (b[axis] - a[axis]);
    const v = a[other] + t * (b[other] - a[other]);
    return axis === 0 ? [bound, v] : [v, bound];
  };
  const out: Ring = [];
  let prev = ring[ring.length - 1];
  for (const cur of ring) {
    if (inside(cur)) {
      if (!inside(prev)) out.push(cross(prev, cur));
      out.push(cur);
    } else if (inside(prev)) {
      out.push(cross(prev, cur));
    }
    prev = cur;
  }
  return out;
}
