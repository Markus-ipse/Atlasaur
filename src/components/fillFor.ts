import type { Feedback } from "../types";

// Hex constants mirror the @theme tokens defined in src/index.css. SVG fill
// attributes assigned from JS need literal color values (not var() references)
// so they interpolate correctly across any future fill animations. Keep these
// in sync with the matching tokens.
export const COLOR_DEFAULT = "#dac79a"; // --color-parchment-map (in-scope land)
export const COLOR_INERT = "#e3d2ad"; // --color-parchment-shadow (out-of-scope)
export const COLOR_HIGHLIGHT = "#b08327"; // --color-ochre (shape-to-name preview)
export const COLOR_CORRECT = "#5d7e3e"; // --color-sap-green (period foliage green — clear "correct" signal)
export const COLOR_WRONG = "#b66556"; // --color-vermillion-faded
export const COLOR_SKIPPED = "#9a7a2a"; // --color-skipped
// Muted tone for the correct country's land neighbors at miss-reveal —
// elaborative spatial cue, never the primary signal. Sits visually under
// the correct/wrong fills so it doesn't compete with them.
export const COLOR_NEIGHBOR = "#c5b791"; // --color-neighbor
export const COLOR_BORDER = "#2b1f12"; // --color-ink-deep
export const COLOR_OCEAN_TINT = "#e6dec9"; // --color-ocean-tint
export const COLOR_OCEAN_LABEL = "#5c4327"; // --color-ink-mid

export function fillFor(args: {
  iso3: string | undefined;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  inScope: boolean;
  neighborSet: ReadonlySet<string>;
}): string {
  const { iso3, highlightedIso3, feedback, inScope, neighborSet } = args;
  if (!iso3) return COLOR_INERT;
  if (feedback) {
    // The correct country always lights up — sap green when answered
    // (right or wrong, since "wrong" reveals the answer too) and ochre
    // when skipped.
    if (feedback.correctIso3 === iso3) {
      return feedback.kind === "skipped" ? COLOR_SKIPPED : COLOR_CORRECT;
    }
    if (
      feedback.kind === "wrong" &&
      feedback.answerIso3 === iso3 &&
      feedback.answerIso3 !== feedback.correctIso3
    ) {
      return COLOR_WRONG;
    }
    // Elaborative-encoding cue: paint land neighbors of the correct country.
    // Wrong-clicked country is handled above so it stays vermillion if it
    // happens to also be a neighbor.
    if (neighborSet.has(iso3)) return COLOR_NEIGHBOR;
  }
  if (highlightedIso3 === iso3) return COLOR_HIGHLIGHT;
  if (!inScope) return COLOR_INERT;
  return COLOR_DEFAULT;
}
