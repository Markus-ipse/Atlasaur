import polylabel from "polylabel";

// Label visibility for the WorldMap reveal-zoom. Splits the per-render
// filtering chain (in-scope, fit-check, collision detection) out of the
// component so it can be unit-tested.

// Approximate average glyph width as a fraction of em — used to estimate
// label width without measuring each <text>. Tuned for the medium-weight
// sans-serif we render at.
export const GLYPH_W_RATIO = 0.55;

// Fallback "moderate" zoom for the legacy em-relative bypass — used only
// before the resize observer reports dimensions (effectiveScale === 0).
// Once measured, the on-screen-px bypass below takes over.
const BYPASS_FIT_K = 1.5;

// Default em size in projection units. Used as the fallback for
// `fontSizeFor` and `computeVisibleLabels` callers that don't pass
// their own em — most importantly during the first render before the
// SVG has been measured.
export const LABEL_EM = 8;

// Target on-screen label size in CSS pixels. The runtime em is scaled
// from this against the rendered SVG width so labels stay this size
// regardless of viewport — without scaling, an 8-em label on a 375px
// phone renders at ~4px, way below readable.
export const TARGET_LABEL_PX = 14;

export function fontSizeFor(k: number, em: number = LABEL_EM): number {
  return em / k;
}

// Each label's collision rect is grown by this fraction of the font size
// in every direction so labels have a small breathing margin instead of
// touching exactly. Must exceed the label stroke ratio (0.18) so two
// rejected-as-non-colliding labels don't have their halos merge on
// screen — at 0.35, the visible gap is ~(0.35-0.18)*2*TARGET_LABEL_PX
// ≈ 4.8px between strokes. Exported so callers building obstacle rects
// (e.g. WorldMap's ocean labels) use the same margin.
export const COLLISION_PADDING = 0.35;

// True microstates — countries whose projected bbox is so small that no
// label could ever fit at any zoom (Liechtenstein, Monaco, Vatican,
// Singapore, San Marino, Andorra, Luxembourg…). Threshold is in
// projection units, not screen pixels, so it can't misfire on a normal
// country that just happens to render small at low zoom (e.g. France on
// a 390px phone). Below this width the fit-check is bypassed and
// collision rejection alone decides whether the label renders.
const TRUE_MICROSTATE_SVG = 1.0;

// Bypass the fit-check at high effective zoom (rendered CSS pixels per
// projection unit). When the user is zoomed in this far, neighbouring
// countries are mostly off-screen anyway, so a label overflowing its
// country's coastline is acceptable — and necessary, because countries
// like Belgium or Slovenia never fit their full name inside their
// coastline at any zoom level we expose. Tuned: kicks in at k≈1.6 on a
// 2000px desktop (effectiveScale ≈ 2.5) and k≈8 on a 390px phone
// (effectiveScale ≈ 0.49), so users can pinch-zoom to surface small-
// country labels.
const HIGH_ZOOM_PX_PER_SVG = 4;

export type Label = {
  numericId: string;
  name: string;
  // Pole of inaccessibility for the country's largest projected ring —
  // where the label is rendered.
  cx: number;
  cy: number;
  // Bounding box of the largest projected ring, used to (a) frame the
  // reveal-zoom and (b) decide whether the label fits inside the country.
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  // Largest-ring area in projected units; used as the importance score
  // when collision-rejecting overlapping labels (bigger country wins).
  area: number;
};

export type Rect = { x0: number; y0: number; x1: number; y1: number };

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// Render-time filter: given the full label list and the current zoom,
// return the labels that should actually be drawn. The pipeline is
//   (1) scope filter — in-scope or a reveal target
//   (2) fit check — label can't be wider than the country, unless the
//       country is too small on screen to ever fit a label (microstate
//       bypass, derived from rendered px so it tracks viewport)
//   (3) collision rejection — sort by importance (reveal targets first,
//       then by area), greedily place each label's projected rect against
//       the obstacle set + already-placed labels.
// O(N²) in the candidate count, but N is ≤ ~180 and the caller is
// expected to memoize on (k, em, effectiveScale, scope, reveal targets,
// obstacles) so this only re-runs when one of those changes.
export function computeVisibleLabels(
  labels: readonly Label[],
  args: {
    k: number;
    /**
     * Em size in projection units. Pass the SVG-scaled em to keep on-
     * screen label size consistent across viewports — see
     * WorldMap.tsx where it's computed from the rendered SVG width.
     * Defaults to LABEL_EM (the desktop reference em).
     */
    em?: number;
    /**
     * Projection-units to CSS-pixels factor (`min(width/W, height/H)`).
     * Drives the microstate-px bypass. Pass 0 to fall back to the
     * legacy em-relative bypass — needed during first paint before the
     * resize observer has measured the SVG.
     */
    effectiveScale: number;
    isInScope: (iso3: string) => boolean;
    isoFromNumeric: (numeric: string) => string | undefined;
    /**
     * iso3s that must always render: the correct country and, on a
     * wrong answer, the country the user clicked. Members bypass scope,
     * fit-check, and obstacle-rejection, and sort first in the greedy
     * pass so they win any candidate-vs-candidate collision too.
     */
    revealIso3s: ReadonlySet<string>;
    /**
     * Pre-occupied rects (e.g. ocean labels). Country candidates that
     * overlap an obstacle are dropped; reveal targets bypass.
     */
    obstacles?: readonly Rect[];
  },
): readonly Label[] {
  const {
    k,
    em = LABEL_EM,
    effectiveScale,
    isInScope,
    isoFromNumeric,
    revealIso3s,
    obstacles,
  } = args;
  const fontSize = fontSizeFor(k, em);
  const labelHeight = fontSize;
  const pad = fontSize * COLLISION_PADDING;

  // Legacy em-relative bypass — only used as the first-paint fallback
  // when effectiveScale isn't yet known. Kept consistent with how
  // labelEm itself falls back to LABEL_EM in WorldMap before the
  // resize observer fires.
  const bypassWidthPerChar = fontSizeFor(BYPASS_FIT_K, em) * GLYPH_W_RATIO;

  type Candidate = { label: Label; w: number; isReveal: boolean };
  const candidates: Candidate[] = [];
  for (const l of labels) {
    const iso3 = isoFromNumeric(l.numericId);
    if (!iso3) continue;
    const isReveal = revealIso3s.has(iso3);
    if (!isReveal && !isInScope(iso3)) continue;
    const countryWidth = l.x1 - l.x0;
    const w = l.name.length * fontSize * GLYPH_W_RATIO;
    const isTrueMicrostate = countryWidth < TRUE_MICROSTATE_SVG;
    const isHighZoom =
      effectiveScale > 0 && effectiveScale * k > HIGH_ZOOM_PX_PER_SVG;
    const bypassFit =
      isTrueMicrostate ||
      isHighZoom ||
      (effectiveScale <= 0 &&
        l.name.length * bypassWidthPerChar > countryWidth);
    // Reveal targets bypass the fit-check too — the whole point of the
    // reveal is to show the answer (and the wrong click) regardless of
    // whether the label fits the coastline.
    if (!isReveal && !bypassFit && w > countryWidth) continue;
    candidates.push({ label: l, w, isReveal });
  }

  // Reveal targets win placement; otherwise larger country wins.
  candidates.sort((a, b) => {
    if (a.isReveal !== b.isReveal) return a.isReveal ? -1 : 1;
    return b.label.area - a.label.area;
  });

  const placed: Rect[] = obstacles ? [...obstacles] : [];
  const visible: Label[] = [];
  for (const c of candidates) {
    const halfW = c.w / 2 + pad;
    const halfH = labelHeight / 2 + pad;
    const rect: Rect = {
      x0: c.label.cx - halfW,
      y0: c.label.cy - halfH,
      x1: c.label.cx + halfW,
      y1: c.label.cy + halfH,
    };
    if (!c.isReveal && placed.some((p) => rectsOverlap(p, rect))) continue;
    placed.push(rect);
    visible.push(c.label);
  }
  return visible;
}

// R3.3a: a reveal label whose anchor lies outside the frame is moved onto the
// part of its country that is on screen, instead of being drawn off screen.
//
// computeRevealTarget drops a giant neighbour from the frame on purpose —
// framing Russia beside Estonia would collapse the answer to a speck — but
// revealIso3s still paints and labels it, and its anchor (the pole of
// inaccessibility, deep in Siberia for Russia) is then nowhere near the
// screen. The learner sees an unnamed wash along one edge. The label goes
// where that wash is: the country's polygons are clipped to the frame and the
// label sits at the pole of inaccessibility of a visible piece — the piece
// nearest the answer, since that is the land that touches it (on a Poland
// reveal, the Russia at Kaliningrad, not Novaya Zemlya), skipping any whose
// pole would cover a label that carries the reveal. Not "the frame edge
// nearest the anchor", which the plan proposed: for Azerbaijan that corner is
// across the Caspian, over Kazakhstan, and a pinned label looks exactly like
// an anchored one. If no piece of the country is on screen there is nothing
// to name and the label is dropped.
//
// Which labels may move is `mayPin`: the answer's neighbours and the wrong
// click. The wrong click is not adjacent, but the rule only ever places a
// label on the country's own visible land, so Sweden clicked for Denmark is
// named where it shows at the top of the frame, and Spain clicked for New
// Caledonia — nothing of it on screen — is simply not.
//
// Precedence: labels drawn at their own anchor are fixed and pinned labels
// yield to them when they carry the reveal — the answer and any neighbour
// that did fit — because those are the teaching and a pinned label must
// never cover them. A pinned label does win over an ambient in-scope label,
// which is there for orientation only. Pinned labels that collide with each
// other are resolved by area, the bigger country first.
export type Ring = [number, number][];
// An outer ring followed by its holes.
export type Polygon = Ring[];

export type PlacedLabel = {
  label: Label;
  x: number;
  y: number;
  // True when the label was moved from its anchor onto the visible part of
  // its country.
  pinned: boolean;
};

// Sutherland–Hodgman: clip a ring to an axis-aligned rectangle. Exact for a
// convex window, which a rectangle is. Returns [] when nothing survives. Two
// visible lobes of one concave ring come back as one ring joined along the
// window's edge; polylabel still lands inside the larger lobe.
export function clipRingToRect(ring: Ring, r: Rect): Ring {
  type Edge = (p: [number, number]) => boolean;
  const edges: [Edge, (a: [number, number], b: [number, number]) => [number, number]][] = [
    [(p) => p[0] >= r.x0, (a, b) => intersectX(a, b, r.x0)],
    [(p) => p[0] <= r.x1, (a, b) => intersectX(a, b, r.x1)],
    [(p) => p[1] >= r.y0, (a, b) => intersectY(a, b, r.y0)],
    [(p) => p[1] <= r.y1, (a, b) => intersectY(a, b, r.y1)],
  ];
  let out: Ring = ring;
  for (const [inside, intersect] of edges) {
    if (out.length === 0) return out;
    const input = out;
    out = [];
    let prev = input[input.length - 1];
    for (const cur of input) {
      if (inside(cur)) {
        if (!inside(prev)) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (inside(prev)) {
        out.push(intersect(prev, cur));
      }
      prev = cur;
    }
  }
  return out;
}
function intersectX(a: [number, number], b: [number, number], x: number): [number, number] {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}
function intersectY(a: [number, number], b: [number, number], y: number): [number, number] {
  const t = (y - a[1]) / (b[1] - a[1]);
  return [a[0] + t * (b[0] - a[0]), y];
}

// Ray casting. Also used by mapGeometry to sort holes from outer rings.
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

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// Cheap reject before clipping: a ring whose bounds miss the window
// contributes nothing. Russia has dozens of island rings far from any frame.
function ringTouches(ring: Ring, r: Rect): boolean {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return rectsOverlap({ x0, y0, x1, y1 }, r);
}

export type Pole = { x: number; y: number; area: number; piece: Polygon };

// Where a label for the visible part of `polygons` could go: one candidate
// per visible piece (a clipped outer ring with its clipped holes), the pole
// of inaccessibility of each, ordered by distance from `near` — the answer's
// anchor, so the piece that touches the answer comes first. Pieces with less
// area than `minArea` (the label's own rect) go last: a sliver at the frame
// edge should not take the label from a real piece, though it still gets it
// when it is all there is. Empty when no piece is visible.
//
// Polylabel's precision is a quarter of `minArea`'s side, coarse on purpose
// (this runs on every zoom frame), and a pole it could not place — its
// `distance` is 0 when the piece is thinner than the precision, and the
// point is then the bbox corner, off the land — is rejected.
export function visiblePoles(
  polygons: readonly Polygon[],
  window: Rect,
  near: readonly [number, number],
  minArea: number,
): Pole[] {
  const precision = Math.max(1e-3, Math.sqrt(minArea) / 4);
  const poles: Pole[] = [];
  for (const [outer, ...holes] of polygons) {
    if (!ringTouches(outer, window)) continue;
    const piece = clipRingToRect(outer, window);
    if (piece.length < 3) continue;
    const area = ringArea(piece);
    if (area <= 0) continue;
    const clippedHoles = holes
      .map((h) => clipRingToRect(h, window))
      .filter((h) => h.length >= 3);
    const p = polylabel([piece, ...clippedHoles], precision);
    if (!(p.distance > 0) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    poles.push({ x: p[0], y: p[1], area, piece: [piece, ...clippedHoles] });
  }
  const d2 = (p: Pole) => (p.x - near[0]) ** 2 + (p.y - near[1]) ** 2;
  return poles.sort((a, b) => {
    const aBig = a.area >= minArea;
    const bBig = b.area >= minArea;
    if (aBig !== bBig) return aBig ? -1 : 1;
    return d2(a) - d2(b);
  });
}

export function pinOffFrameLabels(
  visible: readonly Label[],
  args: {
    // The part of the projection currently on screen, in projection units.
    frame: Rect;
    k: number;
    em?: number;
    // The reveal set — answer, wrong click and neighbours. Drawn at their
    // anchor, these are fixed and a pinned label yields to them.
    isReveal: (numericId: string) => boolean;
    // The subset that may move: the neighbours and the wrong click. The
    // answer is always in frame by construction and never moves.
    mayPin: (numericId: string) => boolean;
    // The answer's anchor; the piece nearest it is labelled first.
    near: readonly [number, number];
    // Every projected polygon of a country, for the clip.
    polygonsOf: (numericId: string) => readonly Polygon[];
  },
): PlacedLabel[] {
  const { frame, k, em = LABEL_EM, isReveal, mayPin, near, polygonsOf } = args;
  const fontSize = fontSizeFor(k, em);
  const pad = fontSize * COLLISION_PADDING;
  const halfH = fontSize / 2 + pad;
  const halfWOf = (l: Label) => (l.name.length * fontSize * GLYPH_W_RATIO) / 2 + pad;
  const rectAt = (l: Label, x: number, y: number): Rect => {
    const halfW = halfWOf(l);
    return { x0: x - halfW, y0: y - halfH, x1: x + halfW, y1: y + halfH };
  };
  // The frame inset by the label's own extent: a label whose anchor is inside
  // this window is wholly on screen and stays put; one outside it is moved.
  // Testing the whole rect rather than the anchor point keeps the handoff
  // continuous — otherwise a label half off screen would sit at its anchor
  // and jump tens of pixels on a sub-pixel pan.
  const windowFor = (l: Label): Rect => {
    const halfW = halfWOf(l);
    return {
      x0: frame.x0 + halfW,
      y0: frame.y0 + halfH,
      x1: frame.x1 - halfW,
      y1: frame.y1 - halfH,
    };
  };
  const within = (l: Label, w: Rect) => l.cx >= w.x0 && l.cx <= w.x1 && l.cy >= w.y0 && l.cy <= w.y1;

  const anchoredReveal: PlacedLabel[] = [];
  const ambient: PlacedLabel[] = [];
  const toPin: Label[] = [];
  for (const l of visible) {
    if (!isReveal(l.numericId)) ambient.push({ label: l, x: l.cx, y: l.cy, pinned: false });
    else if (!mayPin(l.numericId) || within(l, windowFor(l)))
      anchoredReveal.push({ label: l, x: l.cx, y: l.cy, pinned: false });
    else toPin.push(l);
  }
  if (toPin.length === 0) return [...anchoredReveal, ...ambient];

  const fixed: Rect[] = anchoredReveal.map((p) => rectAt(p.label, p.x, p.y));
  const pinned: PlacedLabel[] = [];
  const pinnedRects: Rect[] = [];
  toPin.sort((a, b) => b.area - a.area);
  for (const l of toPin) {
    // A window narrower than the label (an extreme pinch) has no room.
    const window = windowFor(l);
    if (window.x0 >= window.x1 || window.y0 >= window.y1) continue;
    const labelArea = 2 * halfWOf(l) * 2 * halfH;
    for (const pole of visiblePoles(polygonsOf(l.numericId), window, near, labelArea)) {
      const at = settle(l, pole, fixed, window, rectAt, halfH);
      if (!at) continue;
      const [x, y] = at;
      const rect = rectAt(l, x, y);
      fixed.push(rect);
      pinnedRects.push(rect);
      pinned.push({ label: l, x, y, pinned: true });
      break;
    }
  }
  const keptAmbient = ambient.filter(
    (p) => !pinnedRects.some((r) => rectsOverlap(r, rectAt(p.label, p.x, p.y))),
  );
  return [...anchoredReveal, ...pinned, ...keptAmbient];
}

// A pole whose label rect collides with a fixed label is nudged by the
// smallest vector that separates the two, a few times if need be, as long
// as it moves no further than one label height in total and the point is
// still on the piece and inside the window. Poles land a hair under a
// neighbouring label often enough (Russia's mainland pole against Belarus's
// label, by a tenth of a unit, on a phone) that giving up at first contact
// would drop the label in exactly the cases it exists for.
function settle(
  l: Label,
  pole: Pole,
  fixed: readonly Rect[],
  window: Rect,
  rectAt: (l: Label, x: number, y: number) => Rect,
  limit: number,
): [number, number] | null {
  let x = pole.x;
  let y = pole.y;
  for (let step = 0; step < 4; step++) {
    const rect = rectAt(l, x, y);
    const hit = fixed.find((r) => rectsOverlap(r, rect));
    if (!hit) {
      const moved = Math.hypot(x - pole.x, y - pole.y);
      const inWindow = x >= window.x0 && x <= window.x1 && y >= window.y0 && y <= window.y1;
      return moved <= 2 * limit && inWindow && pointInPolygon([x, y], pole.piece) ? [x, y] : null;
    }
    // Minimal translation out of `hit`, along whichever axis is cheaper.
    const dxLeft = hit.x0 - rect.x1;
    const dxRight = hit.x1 - rect.x0;
    const dyUp = hit.y0 - rect.y1;
    const dyDown = hit.y1 - rect.y0;
    const dx = Math.abs(dxLeft) < Math.abs(dxRight) ? dxLeft : dxRight;
    const dy = Math.abs(dyUp) < Math.abs(dyDown) ? dyUp : dyDown;
    const eps = 1e-3;
    if (Math.abs(dx) < Math.abs(dy)) x += dx + Math.sign(dx) * eps;
    else y += dy + Math.sign(dy) * eps;
  }
  return null;
}
