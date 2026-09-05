// Small-country affordances for narrow screens (R1.6). Pure helpers so the
// thresholds can be unit-tested without rendering the map.
//
// Everything is measured in on-screen CSS pixels: a country's largest ring
// is `svgUnits` wide in viewBox space, drawn at `effectiveScale` (CSS px per
// viewBox unit for the letterboxed SVG) and magnified by the zoom `k`.

export type Extent = { x0: number; x1: number; y0: number; y1: number };

// Below this on-screen size a country is hard to tap: frame its continent
// on a narrow map and give it an invisible hit disc.
export const TAP_TARGET_PX = 24;
// Below this the target is hard even to see; nudge the learner to pinch.
export const HINT_TARGET_PX = 12;
// A rendered map narrower than this is a phone (or a very small window);
// auto-framing only happens there so desktop keeps the whole world.
export const NARROW_MAP_PX = 640;
// On-screen diameter of the invisible hit disc around a tiny country.
export const HIT_DISC_PX = 28;
// A region frame is adopted only if it magnifies at least this much over
// the resting frame; a 1.1× "frame" just shoves half the world off-screen
// without making the speck tappable (the Falklands vs all of South America).
export const FRAME_MIN_GAIN = 1.5;

export function screenSizePx(
  extent: Extent,
  effectiveScale: number,
  k: number,
): number {
  const w = extent.x1 - extent.x0;
  const h = extent.y1 - extent.y0;
  return Math.max(w, h) * effectiveScale * k;
}

// Frame the prompt's continent when the target would be too small to tap
// at the resting frame and the map is phone-width. Unknown map size
// (effectiveScale 0, before the resize observer reports) never frames.
export function shouldFrameContinent(
  targetSizePx: number,
  mapWidthPx: number,
): boolean {
  return mapWidthPx > 0 && mapWidthPx < NARROW_MAP_PX && targetSizePx < TAP_TARGET_PX;
}

// Radius in viewBox units of a hit disc that renders HIT_DISC_PX across on
// screen, or null when the country is already big enough to tap.
export function hitDiscRadiusSvg(
  sizePx: number,
  effectiveScale: number,
  k: number,
): number | null {
  if (effectiveScale <= 0 || k <= 0) return null;
  if (sizePx >= TAP_TARGET_PX) return null;
  return HIT_DISC_PX / 2 / (effectiveScale * k);
}

export function worthFraming(frameK: number, baseK: number): boolean {
  return frameK >= FRAME_MIN_GAIN * baseK;
}
