// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoundBreak } from "./RoundBreak";
import type { Subregion } from "../types";
import type { CapitalOffer } from "../game/offer";

afterEach(cleanup);

function setup(
  props: {
    caughtUp?: boolean;
    spotlightSubregion?: Subregion | null;
    newCapReached?: boolean;
    capitalOffer?: CapitalOffer | null;
  } = {},
) {
  const onKeepGoing = vi.fn();
  const onDone = vi.fn();
  const onTryCapitals = vi.fn();
  const onLeaveFocus = vi.fn();
  render(
    <RoundBreak
      practiceMode="study"
      roundsCompleted={1}
      streakDay={1}
      roundCards={10}
      roundRight={8}
      roundNew={10}
      caughtUp={props.caughtUp ?? false}
      spotlightSubregion={props.spotlightSubregion ?? null}
      newCapReached={props.newCapReached ?? false}
      capitalOffer={props.capitalOffer ?? null}
      onTryCapitals={onTryCapitals}
      onLeaveFocus={onLeaveFocus}
      nextBack={null}
      onKeepGoing={onKeepGoing}
      onDone={onDone}
    />,
  );
  return { onKeepGoing, onDone, onTryCapitals, onLeaveFocus };
}

describe("RoundBreak", () => {
  it("does not start another round on Escape or a backdrop click", () => {
    const { onKeepGoing, onDone } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onKeepGoing).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("defaults to Done for now when nothing useful is left", () => {
    setup({ caughtUp: true });
    expect(screen.getByRole("heading", { name: "That's everything for now." })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Done for now" }),
    );
  });

  it("tells a learner with unseen countries left that Keep going brings more", () => {
    setup({ newCapReached: true });
    expect(screen.getByRole("heading", { name: "10 new ones met." })).toBeTruthy();
    expect(screen.getByText("Keep going for more, or rest here.")).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep going" }),
    );
  });

  it("says nothing scope-wide about when cards come back during a focus", () => {
    render(
      <RoundBreak
        practiceMode="study"
        roundsCompleted={1}
        streakDay={1}
        roundCards={4}
        roundRight={4}
        roundNew={0}
        caughtUp
        spotlightSubregion="Western Africa"
        newCapReached={false}
        capitalOffer={null}
        onTryCapitals={vi.fn()}
        onLeaveFocus={vi.fn()}
        nextBack="The next ones come back tomorrow"
        onKeepGoing={vi.fn()}
        onDone={vi.fn()}
      />,
    );
    expect(screen.queryByText(/tomorrow/)).toBeNull();
  });

  it("offers capitals on a caught-up break, where the learner has run out of work", () => {
    const { onTryCapitals } = setup({
      caughtUp: true,
      capitalOffer: { due: 0, ready: 6 },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Try capitals.*6 countries you already know/,
      }),
    );
    expect(onTryCapitals).toHaveBeenCalledTimes(1);
    cleanup();
    // A round that simply filled is not the moment for it.
    setup({ capitalOffer: { due: 0, ready: 6 } });
    expect(screen.queryByRole("button", { name: /Try capitals/ })).toBeNull();
  });

  it("offers a way back to every region when a focus runs out", () => {
    const { onLeaveFocus } = setup({
      caughtUp: true,
      spotlightSubregion: "Western Africa",
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to all regions" }));
    expect(onLeaveFocus).toHaveBeenCalledTimes(1);
    cleanup();
    setup({ caughtUp: true });
    expect(screen.queryByRole("button", { name: "Back to all regions" })).toBeNull();
  });

  it("says a focus is out of work only in its region", () => {
    setup({ caughtUp: true, spotlightSubregion: "Western Africa" });
    expect(
      screen.getByRole("heading", { name: "That's all in Western Africa for now." }),
    ).toBeTruthy();
  });
});
