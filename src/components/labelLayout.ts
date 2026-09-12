import polylabel from "polylabel";
import {
  clipRingToRect,
  rectsOverlap,
  ringBounds,
  type Polygon,
  type Rect,
} from "./polygon";

export type { Rect } from "./polygon";

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

// Half the collision rect of a label: half its estimated width and half its
// height, each grown by the padding. Both placement passes below build their
// rects from this so they can never disagree about a label's footprint.
export function labelHalfExtent(nameLength: number, fontSize: number): { halfW: number; halfH: number } {
  const pad = fontSize * COLLISION_PADDING;
  return {
    halfW: (nameLength * fontSize * GLYPH_W_RATIO) / 2 + pad,
    halfH: fontSize / 2 + pad,
  };
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
    const { halfW, halfH } = labelHalfExtent(c.label.name.length, fontSize);
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
// reveal, the Russia at Kaliningrad, not Novaya Zemlya). Not "the frame edge
// nearest the anchor", which the plan proposed: for Azerbaijan that corner is
// across the Caspian, over Kazakhstan, and a pinned label looks exactly like
// an anchored one. If no piece of the country is on screen there is nothing
// to name and the label is dropped.
//
// Every reveal label may move — the neighbours, the wrong click, and in
// principle the answer, which is in frame by construction and so never does.
// The wrong click is not adjacent, but the rule only ever places a label on
// the country's own visible land, so Sweden clicked for Denmark is named
// where it shows at the top of the frame, and Spain clicked for New Caledonia
// — nothing of it on screen — is simply not.
//
// Precedence: labels drawn at their own anchor are fixed and a pinned label
// never covers one that carries the reveal — the answer and any neighbour
// that did fit — because those are the teaching. The fixed rects, grown by
// the moving label's own extent, are subtracted from the visible land before
// the pole is searched, so it is clear of them by construction rather than
// nudged after the fact. A pinned
// label does win over an ambient in-scope label, which is there for
// orientation only. Pinned labels are placed by area, the bigger country
// first, each becoming an obstacle for the next.
export type PlacedLabel = {
  label: Label;
  x: number;
  y: number;
  // True when the label was moved from its anchor onto the visible part of
  // its country.
  pinned: boolean;
};

// The pieces of `pieces` that lie outside `r`. A rectangle's complement is
// four half-planes and strips, and each of those is a clip window, so the
// remainder of a piece is at most four clipped pieces — every one a proper
// polygon polylabel can search. (Passing the rect to polylabel as a hole
// would not do: its even-odd test counts a point outside the land but inside
// the rect as inside, and the pole can land off the land.)
function subtractRect(pieces: readonly Polygon[], r: Rect): Polygon[] {
  const parts: Rect[] = [
    { x0: -Infinity, y0: -Infinity, x1: r.x0, y1: Infinity },
    { x0: r.x1, y0: -Infinity, x1: Infinity, y1: Infinity },
    { x0: r.x0, y0: -Infinity, x1: r.x1, y1: r.y0 },
    { x0: r.x0, y0: r.y1, x1: r.x1, y1: Infinity },
  ];
  const out: Polygon[] = [];
  for (const piece of pieces) {
    if (!rectsOverlap(ringBounds(piece[0]), r)) {
      out.push(piece);
      continue;
    }
    for (const part of parts) {
      const clipped = clipPolygon(piece, part);
      if (clipped) out.push(clipped);
    }
  }
  return out;
}

// A polygon clipped to a window, or null when its outer ring is gone.
function clipPolygon([outer, ...holes]: Polygon, window: Rect): Polygon | null {
  const o = clipRingToRect(outer, window);
  if (o.length < 3) return null;
  return [o, ...holes.map((h) => clipRingToRect(h, window)).filter((h) => h.length >= 3)];
}

// Where a label for the visible part of `polygons` could go: one candidate
// per visible piece — a polygon clipped to the window, less the `obstacles`
// — at the pole of inaccessibility of each. Ordered so that pieces with room
// for the label (polylabel's `distance`, the radius of the largest inscribed
// circle, at least `roomNeeded`) come first, and within that by distance
// from `near`, the answer's anchor, so the piece that touches the answer
// wins. A piece with no room still gets the label when it is all there is.
// Empty when nothing is visible.
//
// Polylabel's precision is a quarter of the room needed, coarse on purpose
// (this runs on every zoom frame), and a pole it could not place — its
// `distance` is 0 when the piece is thinner than the precision, and the
// point is then the bbox corner, off the land — is rejected.
function visiblePoles(
  polygons: readonly Polygon[],
  window: Rect,
  obstacles: readonly Rect[],
  near: readonly [number, number],
  roomNeeded: number,
): { x: number; y: number; fits: boolean; d2: number }[] {
  const precision = Math.max(1e-3, roomNeeded / 4);
  let pieces: Polygon[] = [];
  for (const poly of polygons) {
    if (!rectsOverlap(ringBounds(poly[0]), window)) continue;
    const clipped = clipPolygon(poly, window);
    if (clipped) pieces.push(clipped);
  }
  for (const r of obstacles) pieces = subtractRect(pieces, r);
  const poles: { x: number; y: number; fits: boolean; d2: number }[] = [];
  for (const piece of pieces) {
    const p = polylabel(piece, precision);
    if (!(p.distance > 0) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    poles.push({
      x: p[0],
      y: p[1],
      fits: p.distance >= roomNeeded,
      d2: (p[0] - near[0]) ** 2 + (p[1] - near[1]) ** 2,
    });
  }
  return poles.sort((a, b) => (a.fits !== b.fits ? (a.fits ? -1 : 1) : a.d2 - b.d2));
}

export function pinOffFrameLabels(
  visible: readonly Label[],
  args: {
    // The part of the projection currently on screen, in projection units.
    frame: Rect;
    k: number;
    em?: number;
    // The answer; the visible piece nearest its anchor is labelled first.
    answerNumericId: string | null;
    // The reveal set — answer, wrong click and neighbours — by numeric id.
    // These may move; everything else is ambient and stays at its anchor.
    revealNumerics: ReadonlySet<string>;
    // Every projected polygon of a country, for the clip.
    polygonsOf: (numericId: string) => readonly Polygon[];
  },
): PlacedLabel[] {
  const { frame, k, em = LABEL_EM, answerNumericId, revealNumerics, polygonsOf } = args;
  const fontSize = fontSizeFor(k, em);
  const extent = (l: Label) => labelHalfExtent(l.name.length, fontSize);
  const rectAt = (l: Label, x: number, y: number): Rect => {
    const { halfW, halfH } = extent(l);
    return { x0: x - halfW, y0: y - halfH, x1: x + halfW, y1: y + halfH };
  };
  // The frame inset by the label's own extent: a label whose anchor is inside
  // this window is wholly on screen and stays put; one outside it is moved.
  // Testing the whole rect rather than the anchor point keeps the handoff
  // continuous — otherwise a label half off screen would sit at its anchor
  // and jump tens of pixels on a sub-pixel pan.
  const windowFor = (l: Label): Rect => {
    const { halfW, halfH } = extent(l);
    return { x0: frame.x0 + halfW, y0: frame.y0 + halfH, x1: frame.x1 - halfW, y1: frame.y1 - halfH };
  };
  const whollyOnScreen = (l: Label) => {
    const w = windowFor(l);
    return l.cx >= w.x0 && l.cx <= w.x1 && l.cy >= w.y0 && l.cy <= w.y1;
  };
  const at = (l: Label, x: number, y: number, pinned: boolean): PlacedLabel => ({ label: l, x, y, pinned });

  const anchoredReveal: PlacedLabel[] = [];
  const ambient: PlacedLabel[] = [];
  const toPin: Label[] = [];
  for (const l of visible) {
    if (!revealNumerics.has(l.numericId)) ambient.push(at(l, l.cx, l.cy, false));
    else if (whollyOnScreen(l)) anchoredReveal.push(at(l, l.cx, l.cy, false));
    else toPin.push(l);
  }
  if (toPin.length === 0) return [...anchoredReveal, ...ambient];

  const answer = visible.find((l) => l.numericId === answerNumericId);
  const near: [number, number] = answer
    ? [answer.cx, answer.cy]
    : [(frame.x0 + frame.x1) / 2, (frame.y0 + frame.y1) / 2];
  const fixed: Rect[] = anchoredReveal.map((p) => rectAt(p.label, p.x, p.y));
  const pinned: PlacedLabel[] = [];
  toPin.sort((a, b) => b.area - a.area);
  for (const l of toPin) {
    // A window narrower than the label (an extreme pinch) has no room.
    const win = windowFor(l);
    if (win.x0 >= win.x1 || win.y0 >= win.y1) continue;
    const { halfW, halfH } = extent(l);
    // A fixed rect grown by this label's extent: any pole outside it keeps
    // this label's whole rect clear of that one.
    const obstacles = fixed.map((r) => ({ x0: r.x0 - halfW, y0: r.y0 - halfH, x1: r.x1 + halfW, y1: r.y1 + halfH }));
    const [pole] = visiblePoles(polygonsOf(l.numericId), win, obstacles, near, halfH);
    if (!pole) continue;
    fixed.push(rectAt(l, pole.x, pole.y));
    pinned.push(at(l, pole.x, pole.y, true));
  }
  const pinnedRects = pinned.map((p) => rectAt(p.label, p.x, p.y));
  const keptAmbient = ambient.filter(
    (p) => !pinnedRects.some((r) => rectsOverlap(r, rectAt(p.label, p.x, p.y))),
  );
  return [...anchoredReveal, ...pinned, ...keptAmbient];
}
