import type { Fact, QuestionMode } from "../types";

// The question modes, sorted into the two questions a learner can be asked
// about a country. Every string-literal mode check in the app goes through
// one of these three helpers, so adding a mode is a change here and nowhere
// else.

// Which SRS record a mode grades and picks against. The map paints
// `location` only — see paintTiers in srs.ts.
export function factOf(mode: QuestionMode): Fact {
  return mode === "capital-to-click" || mode === "country-to-capital"
    ? "capital"
    : "location";
}

// Answered by clicking the map. The map is interactive, tiny countries get
// hit discs, and a wrong answer names the country that was picked.
export function isClickMode(mode: QuestionMode): boolean {
  return mode === "name-to-click" || mode === "capital-to-click";
}

// Answered by typing. These are also exactly the modes that highlight the
// country on the map, since the prompt is about a country already shown.
export function isTypedMode(mode: QuestionMode): boolean {
  return !isClickMode(mode);
}
