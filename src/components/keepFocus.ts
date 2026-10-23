import type { MouseEvent } from "react";

// Spread onto a button in a typed mode's answer area (`{...KEEP_FOCUS}`) so a
// tap on it leaves focus in the answer input (#61). On a phone a button taking
// focus closes the keyboard, and the map resizes under the learner twice a
// card. Keyboard activation is untouched: only the mouse-down default, which
// is what moves focus, is cancelled; the click still fires.
export const KEEP_FOCUS = {
  onMouseDown: (e: MouseEvent) => e.preventDefault(),
};
