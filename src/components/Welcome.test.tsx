// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Welcome } from "./Welcome";

afterEach(cleanup);

function setup() {
  const onStartBig = vi.fn();
  const onStartRegion = vi.fn();
  const onStartTest = vi.fn();
  render(
    <Welcome
      onStartBig={onStartBig}
      onStartRegion={onStartRegion}
      onStartTest={onStartTest}
    />,
  );
  return { onStartBig, onStartRegion, onStartTest };
}

describe("Welcome", () => {
  it("offers three doors and focuses the first", () => {
    const { onStartBig, onStartTest } = setup();
    const big = screen.getByRole("button", { name: /Start with the big ones/ });
    expect(document.activeElement).toBe(big);
    fireEvent.click(big);
    expect(onStartBig).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Test me/ }));
    expect(onStartTest).toHaveBeenCalledTimes(1);
  });

  it("Pick a region requires at least one continent and returns the choice", () => {
    const { onStartRegion } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Pick a region" }));
    const begin = screen.getByRole("button", { name: "Begin" }) as HTMLButtonElement;
    expect(begin.disabled).toBe(true);
    // Focus moves to the first chip, not the disabled Begin.
    expect(document.activeElement).toBe(screen.getByRole("checkbox", { name: "Africa" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Africa" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Europe" }));
    expect(begin.disabled).toBe(false);
    fireEvent.click(begin);
    expect(onStartRegion).toHaveBeenCalledWith(["Africa", "Europe"]);
  });

  it("Back returns to the three doors", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Pick a region" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: /Start with the big ones/ })).toBeTruthy();
  });
});
