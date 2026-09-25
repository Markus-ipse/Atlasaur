// One-time zoom nudge ("pinch to zoom" on touch), remembered per browser so it
// shows once. The key keeps its original name so nobody sees it twice.
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

// The hint's copy. The pinch is the gesture on a touch screen; a mouse or
// trackpad user scrolls, and the + button is there for anyone who does not.
export function zoomHintText(coarse: boolean): string {
  return coarse ? "Pinch to zoom in" : "Scroll, or use the + button, to zoom in";
}
