// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { readCompactLayout, useVisibleViewport } from "./compactLayout";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function device(coarse: boolean, width: number, height: number, type?: string) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q === "(pointer: coarse)" ? coarse : false,
  }));
  vi.spyOn(window.screen, "width", "get").mockReturnValue(width);
  vi.spyOn(window.screen, "height", "get").mockReturnValue(height);
  Object.defineProperty(window.screen, "orientation", {
    configurable: true,
    value: type ? { type } : undefined,
  });
}

// #61: the layout follows the device, not the viewport, which a phone
// keyboard shrinks until it is wider than it is tall.
describe("readCompactLayout", () => {
  it("docks on a phone held upright", () => {
    device(true, 412, 915, "portrait-primary");
    expect(readCompactLayout()).toBe("dock");
  });

  it("uses the rail on a phone held sideways", () => {
    device(true, 915, 412, "landscape-primary");
    expect(readCompactLayout()).toBe("rail");
  });

  it("trusts the orientation over the screen's own numbers", () => {
    // iOS keeps portrait numbers whichever way the phone is turned.
    device(true, 390, 844, "landscape-primary");
    expect(readCompactLayout()).toBe("rail");
  });

  it("leaves a mouse, and a tablet, on the panel", () => {
    device(false, 412, 915, "portrait-primary");
    expect(readCompactLayout()).toBeNull();
    device(true, 820, 1180, "portrait-primary");
    expect(readCompactLayout()).toBeNull();
  });
});

// iOS lays the keyboard over the page, so the compact layout fits itself to
// what the visual viewport still shows.
describe("useVisibleViewport", () => {
  function fakeViewport(height: number, offsetTop: number, scale = 1) {
    const vv = Object.assign(new EventTarget(), { height, offsetTop, scale });
    vi.stubGlobal("visualViewport", vv);
    return vv;
  }

  it("follows the visible area as the keyboard comes up", () => {
    const vv = fakeViewport(844, 0);
    const { result } = renderHook(() => useVisibleViewport(true));
    expect(result.current).toEqual({ height: 844, top: 0 });
    act(() => {
      Object.assign(vv, { height: 480, offsetTop: 120 });
      vv.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toEqual({ height: 480, top: 120 });
  });

  it("stays out of the way when not wanted or while the page is zoomed", () => {
    fakeViewport(844, 0);
    expect(
      renderHook(() => useVisibleViewport(false)).result.current,
    ).toBeNull();
    fakeViewport(400, 200, 2);
    expect(
      renderHook(() => useVisibleViewport(true)).result.current,
    ).toBeNull();
  });
});
