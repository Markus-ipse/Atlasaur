import { describe, expect, it } from "vitest";
import { zoomHintText } from "./pinchHint";

describe("zoomHintText", () => {
  it("tells a touch screen to pinch", () => {
    expect(zoomHintText(true)).toBe("Pinch to zoom in");
  });

  it("tells a pointer to scroll, or use the + button", () => {
    expect(zoomHintText(false)).toBe("Scroll, or use the + button, to zoom in");
  });
});
