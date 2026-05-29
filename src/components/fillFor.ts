import type { Feedback } from "../types";

// SVG fill/stroke attributes set from JS need literal color values — var()
// references don't interpolate across CSS transitions reliably. We resolve
// the @theme tokens from src/index.css to hex strings at theme-flip time
// via readPaletteFromCss(), then pass the palette down. The values reaching
// SVG attributes stay literal, but CSS remains the single source of truth.

export type Palette = {
  default: string; // in-scope land
  inert: string; // out-of-scope / undefined country
  highlight: string; // shape-to-name preview
  correct: string; // correct country fill on answer reveal
  wrong: string; // wrong-clicked country fill
  skipped: string; // correct country fill on skip
  neighbor: string; // miss-reveal land neighbors
  border: string; // country path stroke
  oceanTint: string; // SVG/map background
  oceanLabel: string; // ocean label text
  capitalDot: string; // miss-reveal capital marker fill
  capitalDotHalo: string; // miss-reveal capital marker halo
};

// CSS custom property names, keyed by Palette slot. Centralized so the
// mapping is auditable in one place.
const PALETTE_TOKENS: Record<keyof Palette, string> = {
  default: "--color-parchment-map",
  inert: "--color-parchment-shadow",
  highlight: "--color-ochre",
  correct: "--color-sap-green",
  wrong: "--color-vermillion-faded",
  skipped: "--color-skipped",
  neighbor: "--color-neighbor",
  border: "--color-map-border",
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

export function fillFor(
  args: {
    iso3: string | undefined;
    highlightedIso3: string | null;
    feedback: Feedback | null;
    inScope: boolean;
    neighborSet: ReadonlySet<string>;
  },
  palette: Palette,
): string {
  const { iso3, highlightedIso3, feedback, inScope, neighborSet } = args;
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
  if (!inScope) return palette.inert;
  return palette.default;
}
