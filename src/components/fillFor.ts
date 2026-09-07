import type { MasteryTier } from "../game/srs";
import type { Feedback } from "../types";

// SVG fill/stroke attributes set from JS need literal color values — var()
// references don't interpolate across CSS transitions reliably. We resolve
// the @theme tokens from src/index.css to hex strings at theme-flip time
// via readPaletteFromCss(), then pass the palette down. The values reaching
// SVG attributes stay literal, but CSS remains the single source of truth.

export type Palette = {
  masteryUnseen: string; // in-scope land, never answered — ghost outline
  masterySeen: string; // in-scope land with a record, not yet known
  masteryKnown: string; // in-scope land the learner knows — full pigment
  inert: string; // out-of-scope / undefined country
  highlight: string; // shape-to-name preview
  correct: string; // correct country fill on answer reveal
  wrong: string; // wrong-clicked country fill
  skipped: string; // correct country fill on skip
  neighbor: string; // miss-reveal land neighbors
  spotlight: string; // ambient tint for the focused spotlight subregion
  border: string; // country path stroke
  borderInverse: string; // country path stroke where `border` would vanish
  oceanTint: string; // SVG/map background
  oceanLabel: string; // ocean label text
  capitalDot: string; // miss-reveal capital marker fill
  capitalDotHalo: string; // miss-reveal capital marker halo
};

// CSS custom property names, keyed by Palette slot. Centralized so the
// mapping is auditable in one place.
const PALETTE_TOKENS: Record<keyof Palette, string> = {
  masteryUnseen: "--color-mastery-unseen",
  masterySeen: "--color-mastery-seen",
  masteryKnown: "--color-mastery-known",
  inert: "--color-parchment-shadow",
  highlight: "--color-ochre",
  correct: "--color-sap-green",
  wrong: "--color-vermillion-faded",
  skipped: "--color-skipped",
  neighbor: "--color-neighbor",
  spotlight: "--color-spotlight",
  border: "--color-map-border",
  borderInverse: "--color-map-border-inverse",
  oceanTint: "--color-ocean-tint",
  oceanLabel: "--color-ink-mid",
  capitalDot: "--color-ink-deep",
  capitalDotHalo: "--color-parchment-base",
};

// Resolves the current Palette by reading CSS custom properties off
// <html>. Call this AFTER the theme's data-theme attribute has been
// applied (the pre-paint script in index.html does this on first load;
// useTheme's layout effect does it on toggle). Safe to call at module
// init in a browser env — returns empty strings under SSR/jsdom without
// a populated stylesheet, which is fine for tests that pass their own
// palette fixture rather than calling this.
export function readPaletteFromCss(): Palette {
  const root = getComputedStyle(document.documentElement);
  const get = (name: string) => root.getPropertyValue(name).trim();
  const out = {} as Palette;
  for (const key of Object.keys(PALETTE_TOKENS) as (keyof Palette)[]) {
    out[key] = get(PALETTE_TOKENS[key]);
  }
  // Dev-mode loudness: a typo in PALETTE_TOKENS or a missing @theme entry
  // returns an empty string here and paints SVG fills as black/transparent
  // — exactly the silent divergence this refactor exists to prevent. Warn
  // so it shows up in the console during local work. Skipped under jsdom
  // (no parsed stylesheets → every token is empty by definition, would
  // spam ten warnings per <App /> mount in tests).
  if (import.meta.env.DEV && document.styleSheets.length > 0) {
    for (const key of Object.keys(out) as (keyof Palette)[]) {
      if (!out[key]) {
        console.warn(
          `[palette] empty value for ${key} (CSS token ${PALETTE_TOKENS[key]})`,
        );
      }
    }
  }
  return out;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

// Ambient mastery paint, indexed by MasteryTier.
const MASTERY_SLOT = [
  "masteryUnseen",
  "masterySeen",
  "masteryKnown",
] as const satisfies readonly (keyof Palette)[];

export function fillFor(
  args: {
    iso3: string | undefined;
    highlightedIso3: string | null;
    feedback: Feedback | null;
    inScope: boolean;
    neighborSet: ReadonlySet<string>;
    spotlightSet?: ReadonlySet<string>;
    // How much of this country the learner has taken (R2.1). Defaults to 0
    // (unseen) so callers that predate the ambient paint still type-check.
    masteryTier?: MasteryTier;
  },
  palette: Palette,
): string {
  const { iso3, highlightedIso3, feedback, inScope, neighborSet } = args;
  const spotlightSet = args.spotlightSet ?? EMPTY_SET;
  if (!iso3) return palette.inert;
  if (feedback) {
    // The correct country always lights up — sap green when answered
    // (right or wrong, since "wrong" reveals the answer too) and ochre
    // when skipped.
    if (feedback.correctIso3 === iso3) {
      return feedback.kind === "skipped" ? palette.skipped : palette.correct;
    }
    if (
      feedback.kind === "wrong" &&
      feedback.answerIso3 === iso3 &&
      feedback.answerIso3 !== feedback.correctIso3
    ) {
      return palette.wrong;
    }
    // Elaborative-encoding cue: paint land neighbors of the correct country.
    // Wrong-clicked country is handled above so it stays vermillion if it
    // happens to also be a neighbor.
    if (neighborSet.has(iso3)) return palette.neighbor;
  }
  if (highlightedIso3 === iso3) return palette.highlight;
  // Ambient spotlight tint — lowest-priority overlay, so it never competes
  // with feedback/neighbor/highlight signals. Note the `if (feedback)` block
  // above only early-returns for the correct/wrong/neighbor countries, so
  // during a miss-reveal a spotlight country that isn't one of those still
  // shows the tint here. That's intended (spotlight is a persistent ambient
  // cue, not a transient reveal).
  if (spotlightSet.has(iso3)) return palette.spotlight;
  if (!inScope) return palette.inert;
  // Ambient mastery paint — the bottom of the chain. Everything above is
  // either a reveal (transient) or a focus the learner asked for; progress is
  // what shows when none of those apply.
  return palette[MASTERY_SLOT[args.masteryTier ?? 0]];
}

// --- The engraved line -----------------------------------------------------
//
// One border ink can't hold against a fill ramp that spans the whole
// luminance range. In dark mode --color-map-border is a warm faded ochre so
// coastlines read against the near-black ocean — which means it all but
// disappears into the bright pigments above it in fillFor's chain: known
// land, the spotlight wash, a reveal's green/red/neighbour tones. Two gold
// countries side by side then look like one landmass, which is exactly the
// shape a learner is being asked to find.
//
// So the line has a second ink. `strokeFor` keeps --color-map-border unless
// it is failing against the fill it sits on, and only then reaches for
// --color-map-border-inverse (dark near-black under dark, pale under light).
// The floor keeps it from flipping on marginal gains: in light mode nothing
// reaches it, so the map there is untouched.
//
// Where two countries meet only one of the two strokes wins by paint order.
// That's fine — each is chosen against its own fill, so the shared edge
// always reads against at least one side of it.

export const BORDER_MIN_CONTRAST = 2.5;

// Relative luminance per WCAG 2.x. Returns null for anything we can't parse
// — a palette fixture with sentinel values, or a token that resolved empty
// under jsdom — so the caller falls back to the default ink rather than
// guessing.
function relativeLuminance(color: string): number | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// #rgb, #rrggbb and rgb()/rgba() — the forms getPropertyValue can hand back
// for a color token across browsers.
function parseColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1];
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (fn) {
    const parts = fn[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3);
    if (parts.length !== 3) return null;
    const nums = parts.map((p) =>
      p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p),
    );
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums as [number, number, number];
  }
  return null;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Runs for every path on every render, over a handful of distinct fills.
// Keyed on the ink pair too, so a theme flip can't serve a stale answer.
const STROKE_CACHE = new Map<string, string>();

export function strokeFor(fill: string, palette: Palette): string {
  const key = `${fill}|${palette.border}|${palette.borderInverse}`;
  const hit = STROKE_CACHE.get(key);
  if (hit !== undefined) return hit;
  const stroke = chooseStroke(fill, palette);
  STROKE_CACHE.set(key, stroke);
  return stroke;
}

function chooseStroke(fill: string, palette: Palette): string {
  const onBorder = contrastRatio(fill, palette.border);
  if (onBorder === null || onBorder >= BORDER_MIN_CONTRAST) {
    return palette.border;
  }
  const onInverse = contrastRatio(fill, palette.borderInverse);
  if (onInverse === null || onInverse <= onBorder) return palette.border;
  return palette.borderInverse;
}
