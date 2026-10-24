import { useEffect, useState } from "react";

// How a typed mode is laid out on a phone (#61): a strip at the top and the
// answer docked on the keyboard in portrait, a narrow rail beside the map in
// landscape. Null everywhere else, where the panel layout stands.
export type CompactLayout = "dock" | "rail";

// A phone's short side, in CSS px, stays under this; a small tablet's does not.
const PHONE_MAX_PX = 600;

// Judged on the screen, never the viewport: a phone keyboard shrinks the
// viewport until it is wider than it is tall, and the `landscape:` variant
// then put the map in a column beside the panel the moment the learner began
// to type. `screen.orientation` turns with the device where `screen.width`
// does not (iOS keeps portrait values), so it decides when it exists.
export function readCompactLayout(): CompactLayout | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return null;
  if (!window.matchMedia("(pointer: coarse)").matches) return null;
  const { width, height } = window.screen;
  if (Math.min(width, height) >= PHONE_MAX_PX) return null;
  const type = window.screen.orientation?.type;
  const portrait = type ? type.startsWith("portrait") : height >= width;
  return portrait ? "dock" : "rail";
}

export function useCompactLayout(): CompactLayout | null {
  const [layout, setLayout] = useState(readCompactLayout);
  useEffect(() => {
    const update = () => setLayout(readCompactLayout());
    const orientation = window.screen?.orientation;
    window.addEventListener("resize", update);
    orientation?.addEventListener?.("change", update);
    return () => {
      window.removeEventListener("resize", update);
      orientation?.removeEventListener?.("change", update);
    };
  }, []);
  return layout;
}
