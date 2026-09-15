// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useGame } from "./useGame";

afterEach(() => {
  vi.useRealTimers();
  try {
    window.localStorage.clear();
  } catch {
    // ignore
  }
});

describe("useGame — transient toast timer", () => {
  it("auto-dismisses transientMessage after the configured interval", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useGame());

    act(() => {
      result.current.setTransientMessage("Nothing left to focus on in Eastern Europe — back to all your regions.");
    });
    expect(result.current.state.transientMessage).toBe(
      "Nothing left to focus on in Eastern Europe — back to all your regions.",
    );

    // The hook owns a ~3s auto-dismiss timer.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.state.transientMessage).toBeNull();
  });
});
