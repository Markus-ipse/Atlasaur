// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoundBreak } from "./RoundBreak";
import type { Subregion } from "../types";
import type { CapitalOffer } from "../game/offer";
import type { TestTally } from "../game/testTally";

const NO_TEST: TestTally = { size: 0, firstTry: 0, recovered: 0, stillMissed: 0, notAsked: 0 };

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
      test={NO_TEST}
      phase="normal"
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
        test={NO_TEST}
        phase="normal"
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

  function renderTestBreak(test: TestTally, phase: "normal" | "review") {
    const onKeepGoing = vi.fn();
    const onDone = vi.fn();
    render(
      <RoundBreak
        practiceMode="quiz"
        roundsCompleted={1}
        streakDay={1}
        roundCards={12}
        roundRight={11}
        roundNew={0}
        test={test}
        phase={phase}
        caughtUp
        spotlightSubregion={null}
        newCapReached={false}
        capitalOffer={null}
        onTryCapitals={vi.fn()}
        onLeaveFocus={vi.fn()}
        nextBack={null}
        onKeepGoing={onKeepGoing}
        onDone={onDone}
      />,
    );
    return { onKeepGoing, onDone };
  }

  it("in a test, leads with progress rather than calling a round done", () => {
    // Twelve answers into a world test, one skipped and waiting.
    const { onKeepGoing, onDone } = renderTestBreak(
      { size: 197, firstTry: 11, recovered: 0, stillMissed: 1, notAsked: 185 },
      "normal",
    );
    expect(screen.getByRole("heading", { name: "11 of 197 done." })).toBeTruthy();
    expect(
      screen.getByText(/11 right first try · 1 to try again · 185 not yet asked/),
    ).toBeTruthy();
    expect(screen.getByText(/Keep going to finish the test/)).toBeTruthy();
    expect(screen.queryByText(/of 12 right/)).toBeNull();
    // Keep going is the default even when Study would call itself caught up.
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Keep going" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "End the test here" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onKeepGoing).not.toHaveBeenCalled();
  });

  it("in a review pass, counts only the misses left", () => {
    // A test ended early, then Review: countries never asked are not coming.
    renderTestBreak(
      { size: 50, firstTry: 7, recovered: 10, stillMissed: 3, notAsked: 30 },
      "review",
    );
    expect(
      screen.getByRole("heading", { name: "3 misses left to review." }),
    ).toBeTruthy();
    expect(screen.getByText("10 recovered · 3 to try again")).toBeTruthy();
    expect(screen.queryByText(/not yet asked|first try|finish the test/)).toBeNull();
    expect(screen.getByRole("button", { name: "End the review here" })).toBeTruthy();
  });
});
