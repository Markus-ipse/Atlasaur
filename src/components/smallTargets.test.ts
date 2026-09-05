import { describe, expect, it } from "vitest";
import {
  HINT_TARGET_PX,
  HIT_DISC_PX,
  NARROW_MAP_PX,
  TAP_TARGET_PX,
  hitDiscRadiusSvg,
  screenSizePx,
  shouldFrameContinent,
  worthFraming,
  FRAME_MIN_GAIN,
} from "./smallTargets";

describe("screenSizePx", () => {
  it("uses the larger side, scaled by effectiveScale and k", () => {
    // 10 × 4 viewBox units on a phone (0.49 px/unit) at world zoom.
    expect(screenSizePx({ x0: 0, x1: 10, y0: 0, y1: 4 }, 0.49, 1)).toBeCloseTo(4.9);
    // Zooming in 4× makes it 4× bigger on screen.
    expect(screenSizePx({ x0: 0, x1: 10, y0: 0, y1: 4 }, 0.49, 4)).toBeCloseTo(19.6);
  });
});

describe("shouldFrameContinent", () => {
  it("frames only on a narrow map and only for tiny targets", () => {
    expect(shouldFrameContinent(TAP_TARGET_PX - 1, 390)).toBe(true);
    expect(shouldFrameContinent(TAP_TARGET_PX, 390)).toBe(false);
    expect(shouldFrameContinent(5, NARROW_MAP_PX)).toBe(false);
    expect(shouldFrameContinent(5, 1280)).toBe(false);
  });

  it("never frames before the map size is known", () => {
    expect(shouldFrameContinent(0, 0)).toBe(false);
  });
});

describe("hitDiscRadiusSvg", () => {
  it("returns a radius that renders HIT_DISC_PX across on screen", () => {
    const r = hitDiscRadiusSvg(5, 0.5, 2);
    expect(r).not.toBeNull();
    // diameter in px = 2r × effectiveScale × k
    expect(2 * (r as number) * 0.5 * 2).toBeCloseTo(HIT_DISC_PX);
  });

  it("is null for countries already big enough, or with unknown scale", () => {
    expect(hitDiscRadiusSvg(TAP_TARGET_PX, 0.5, 1)).toBeNull();
    expect(hitDiscRadiusSvg(5, 0, 1)).toBeNull();
  });

  it("hint threshold sits below the tap threshold", () => {
    expect(HINT_TARGET_PX).toBeLessThan(TAP_TARGET_PX);
  });
});

describe("worthFraming", () => {
  it("adopts a frame only when it magnifies meaningfully", () => {
    expect(worthFraming(1.17, 1)).toBe(false);
    expect(worthFraming(FRAME_MIN_GAIN, 1)).toBe(true);
    expect(worthFraming(4.87, 1)).toBe(true);
    // Relative to an already-narrowed filter frame.
    expect(worthFraming(2.5, 2)).toBe(false);
  });
});
