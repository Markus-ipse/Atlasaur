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
