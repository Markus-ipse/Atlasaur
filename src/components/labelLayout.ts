// Label visibility for the WorldMap reveal-zoom. Splits the per-render
// filtering chain (in-scope, fit-check, collision detection) out of the
// component so it can be unit-tested.

// Approximate average glyph width as a fraction of em — used to estimate
// label width without measuring each <text>. Tuned for the medium-weight
// sans-serif we render at.
export const GLYPH_W_RATIO = 0.55;

// "Moderate" zoom for the bypassFit threshold — countries whose label
// can't fit at this zoom level always overflow their coastline, so we
// render their labels independent of country size and let the collision
// pass decide whether they're shown.
export const BYPASS_FIT_K = 1.5;

// Em size for label text in projection units before the zoom transform
// scales it. Labels render at fontSize = LABEL_EM / k so they stay a
// constant 8px-equivalent on screen regardless of zoom.
export const LABEL_EM = 8;
export function fontSizeFor(k: number): number {
  return LABEL_EM / k;
}

// Each label's collision rect is grown by this fraction of the font size
// in every direction so labels have a small breathing margin instead of
// touching exactly. Tuned by eye against world/regional reveal-zooms.
const COLLISION_PADDING = 0.15;

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
  // True when even at moderate zoom the label can't fit inside the
  // country — i.e. small islands and microstates whose label always
  // overflows the coastline. For these, skip the per-country fit check
  // and let collision detection alone decide visibility.
  bypassFit: boolean;
  // Largest-ring area in projected units; used as the importance score
  // when collision-rejecting overlapping labels (bigger country wins).
  area: number;
};

type Rect = { x0: number; y0: number; x1: number; y1: number };

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

// Render-time filter: given the full label list and the current zoom,
// return the labels that should actually be drawn. The pipeline is
//   (1) scope filter — in-scope or the correct country
//   (2) fit check — label can't be wider than the country, unless bypassFit
//   (3) collision rejection — sort by importance (correct first, then by
//       area), greedily place each label's screen-space rect, drop any
//       whose rect overlaps one already placed.
// O(N²) in the candidate count, but N is ≤ ~180 and the caller is
// expected to memoize on (k, scope, correct-iso3) so this only re-runs
// when one of those changes.
export function computeVisibleLabels(
  labels: readonly Label[],
  args: {
    k: number;
    isInScope: (iso3: string) => boolean;
    isoFromNumeric: (numeric: string) => string | undefined;
    correctIso3: string | null;
  },
): readonly Label[] {
  const { k, isInScope, isoFromNumeric, correctIso3 } = args;
  const fontSize = fontSizeFor(k);
  const labelHeight = fontSize;
  const pad = fontSize * COLLISION_PADDING;

  type Candidate = { label: Label; w: number; isCorrect: boolean };
  const candidates: Candidate[] = [];
  for (const l of labels) {
    const iso3 = isoFromNumeric(l.numericId);
    if (!iso3) continue;
    const isCorrect = iso3 === correctIso3;
    if (!isCorrect && !isInScope(iso3)) continue;
    const w = l.name.length * fontSize * GLYPH_W_RATIO;
    if (!l.bypassFit && w > l.x1 - l.x0) continue;
    candidates.push({ label: l, w, isCorrect });
  }

  // Correct country always wins placement; otherwise larger country wins.
  candidates.sort((a, b) => {
    if (a.isCorrect !== b.isCorrect) return a.isCorrect ? -1 : 1;
    return b.label.area - a.label.area;
  });

  const placed: Rect[] = [];
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
    if (placed.some((p) => rectsOverlap(p, rect))) continue;
    placed.push(rect);
    visible.push(c.label);
  }
  return visible;
}
