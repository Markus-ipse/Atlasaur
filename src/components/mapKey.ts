import type { Feedback, QuestionMode } from "../types";
import { hidesIntroduced, type MasteryTier } from "../game/srs";
import { isTypedMode } from "../game/questionModes";
import { RECEDE_FILL, recede, wrongPickOf, type Palette } from "./fillFor";

// The map key (#62): what the colours on the map mean right now, and nothing
// else. Each entry is a colour the map is actually showing, named in the
// learner's words, so the key changes with the card — a reveal's colours
// during a reveal, progress while there is progress to read — and a first-day
// map, a test round or a Capital → Click card shows no progress tones at all,
// because the map shows none (omit rather than show zero).
//
// Everything here is read off the same inputs fillFor paints from, so the key
// cannot name a colour the map is not drawing. `line` is "dashed" for the one
// entry the map draws with a dashed outline, a wrong pick.

export type MapKeyEntry = {
  id: string;
  label: string;
  fill: string;
  line?: "solid" | "dashed";
};

export type MapKey = {
  entries: MapKeyEntry[];
  // One line under the entries, for what a colour's absence means.
  note: string | null;
};

export type MapKeyInput = {
  mode: QuestionMode;
  feedback: Feedback | null;
  highlightedIso3: string | null;
  // The answer's land neighbours, painted teal through a miss reveal.
  neighborIso3s: readonly string[];
  spotlightIso3Set: ReadonlySet<string>;
  masteryByIso3: ReadonlyMap<string, MasteryTier>;
  isInScope: (iso3: string) => boolean;
  // The learner's selection leaves out part of the map, which is then drawn
  // inert. False in the expedition, which asks about the whole world.
  scopeNarrowed: boolean;
  // A Name → Click focus: the map carries no progress (focusHidesProgress).
  focusHidesProgress: boolean;
  palette: Palette;
};

export function mapKeyFor(input: MapKeyInput): MapKey {
  const { feedback, palette } = input;

  // A miss reveal: the key names the reveal's own colours and nothing else,
  // since those are the ones worth reading while it is up.
  if (feedback && feedback.kind !== "correct") {
    const entries: MapKeyEntry[] = [
      { id: "answer", label: "The answer", fill: palette.correct },
    ];
    const wrong = wrongPickOf(feedback);
    if (wrong) {
      entries.push({
        id: "wrong",
        label: "Your answer",
        fill: palette.wrong,
        line: "dashed",
      });
    }
    // A neighbour that is also the wrong pick stays red (fillFor), so count
    // only the ones actually drawn teal: Spain picked for Portugal leaves no
    // teal on the map at all.
    if (input.neighborIso3s.some((iso3) => iso3 !== wrong)) {
      entries.push({
        id: "neighbor",
        label: "Its neighbours",
        fill: palette.neighbor,
      });
    }
    return { entries, note: null };
  }

  const entries: MapKeyEntry[] = [];
  if (!feedback && input.highlightedIso3 && isTypedMode(input.mode)) {
    entries.push({
      id: "target",
      label: "The country in the question",
      fill: palette.highlight,
      line: "solid",
    });
  }

  const focus = input.spotlightIso3Set;
  const focused = focus.size > 0;
  // Progress tones only once the map is showing some: a country the learner
  // has met, where the map paints it — inside the focus when there is one,
  // since the rest of the map is set back.
  let painted = false;
  for (const [iso3, tier] of input.masteryByIso3) {
    if (tier < 1 || !input.isInScope(iso3)) continue;
    if (focused && !focus.has(iso3)) continue;
    painted = true;
    break;
  }
  // Named as the summary tiles and the settings figures name them, so the
  // map and the numbers read as one thing.
  if (painted) {
    if (hidesIntroduced(input.mode)) {
      entries.push(
        { id: "unseen", label: "Not yet known", fill: palette.masteryUnseen },
        { id: "known", label: "Known", fill: palette.masteryKnown },
      );
    } else {
      entries.push(
        { id: "unseen", label: "Not yet seen", fill: palette.masteryUnseen },
        { id: "seen", label: "Seen", fill: palette.masterySeen },
        { id: "known", label: "Known", fill: palette.masteryKnown },
      );
    }
  }

  if (focused) {
    entries.push({
      id: "outside",
      label: "Outside your focus",
      fill: recede(palette.masteryUnseen, palette, RECEDE_FILL),
    });
  } else if (input.scopeNarrowed) {
    entries.push({
      id: "inert",
      label: "Continents you left out",
      fill: palette.inert,
    });
  }

  const note =
    focused && input.focusHidesProgress
      ? "Progress is hidden while you focus, so it can't point at the answer."
      : null;
  return { entries, note };
}

// Whether the learner has folded the key away, remembered per browser like the
// theme and the zoom hint. A UI preference, not progress: "Erase all
// progress" leaves it alone.
const COLLAPSED_KEY = "atlasaur:mapKeyCollapsed";

export function loadMapKeyCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveMapKeyCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {
    // ignore
  }
}
