// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CaughtUp } from "./CaughtUp";
import type { Subregion } from "../types";

afterEach(cleanup);

function setup(spotlightSubregion: Subregion | null) {
  const onLeaveFocus = vi.fn();
  render(
    <CaughtUp
      onKeepGoing={vi.fn()}
      capitalOffer={null}
      onTryCapitals={vi.fn()}
      nextBack="The next ones come back tomorrow"
      newLeft={false}
      spotlightSubregion={spotlightSubregion}
      onLeaveFocus={onLeaveFocus}
    />,
  );
  return { onLeaveFocus };
}

describe("CaughtUp", () => {
  it("says when the next ones come back outside a focus", () => {
    setup(null);
    expect(screen.getByText("Nothing more has come back for now.")).toBeTruthy();
    expect(screen.getByText(/tomorrow/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to all regions" })).toBeNull();
  });

  it("names the region in a focus, where the rest of the scope may have cards back", () => {
    setup("Western Africa");
    expect(screen.getByText("Nothing more in Western Africa for now.")).toBeTruthy();
    expect(screen.queryByText(/has come back/)).toBeNull();
    expect(screen.queryByText(/tomorrow/)).toBeNull();
    expect(screen.queryByText(/Come back later/)).toBeNull();
  });

  it("offers a way back to every region from inside a focus", () => {
    const { onLeaveFocus } = setup("Western Africa");
    fireEvent.click(screen.getByRole("button", { name: "Back to all regions" }));
    expect(onLeaveFocus).toHaveBeenCalledTimes(1);
  });
});
