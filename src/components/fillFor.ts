import type { Feedback } from "../types";

// SVG fill/stroke attributes set from JS need literal color values — var()
// references don't interpolate across transitions reliably. We mirror the
// @theme tokens defined in src/index.css here as hex literals and pass the
// active palette through from the theme-aware layer in App.tsx.

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
};

export const LIGHT_PALETTE: Palette = {
  default: "#dac79a", // --color-parchment-map
  inert: "#e3d2ad", // --color-parchment-shadow
  highlight: "#b08327", // --color-ochre
  correct: "#5d7e3e", // --color-sap-green
  wrong: "#b66556", // --color-vermillion-faded
  skipped: "#9a7a2a", // --color-skipped
  neighbor: "#c5b791", // --color-neighbor
  border: "#2b1f12", // --color-map-border (mirrors --color-ink-deep in light)
  oceanTint: "#e6dec9", // --color-ocean-tint
  oceanLabel: "#5c4327", // --color-ink-mid
};

export const DARK_PALETTE: Palette = {
  default: "#2a241c", // --color-parchment-map (dark)
  inert: "#1a1612", // --color-parchment-shadow (dark)
  highlight: "#d49a3a", // --color-ochre (dark)
  correct: "#7d9a4c", // --color-sap-green (dark)
  wrong: "#a64634", // --color-vermillion-faded (dark)
  skipped: "#c69a36", // --color-skipped (dark)
  neighbor: "#8a7a4a", // --color-neighbor (dark) — warm muted ink, not blue
  border: "#7a6440", // --color-map-border (dark) — warm faded ochre
  oceanTint: "#060503", // --color-ocean-tint (dark)
  oceanLabel: "#b89a6c", // --color-ink-mid (dark)
};

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
