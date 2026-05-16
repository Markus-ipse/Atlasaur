import type { Feedback } from "../types";

export const COLOR_DEFAULT = "#cbd5e1";
export const COLOR_INERT = "#e2e8f0";
export const COLOR_HIGHLIGHT = "#3b82f6";
export const COLOR_CORRECT = "#22c55e";
export const COLOR_WRONG = "#ef4444";
export const COLOR_SKIPPED = "#eab308";
// Muted tone for the correct country's land neighbors at miss-reveal —
// elaborative spatial cue, never the primary signal. Sits visually under
// the correct/wrong fills so it doesn't compete with them.
export const COLOR_NEIGHBOR = "#bfdbfe";
export const COLOR_BORDER = "#475569";

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
    // The correct country always lights up — green when answered (right or
    // wrong, since "wrong" reveals the answer too) and yellow when skipped.
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
    // Wrong-clicked country is handled above so it stays red if it happens
    // to also be a neighbor.
    if (neighborSet.has(iso3)) return COLOR_NEIGHBOR;
  }
  if (highlightedIso3 === iso3) return COLOR_HIGHLIGHT;
  if (!inScope) return COLOR_INERT;
  return COLOR_DEFAULT;
}
