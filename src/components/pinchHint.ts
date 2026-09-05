// One-time "pinch to zoom" nudge, remembered per browser so it shows once.
// UI preference only — no game state.
const KEY = "atlasaur:seenPinchHint";

export function loadSeenPinchHint(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function saveSeenPinchHint(): void {
  try {
    window.localStorage.setItem(KEY, "true");
  } catch {
    // ignore
  }
}

// Touch screens are where a pinch is the gesture; a mouse user scrolls.
export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches === true
  );
}
