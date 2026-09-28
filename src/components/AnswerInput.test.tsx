// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnswerInput } from "./AnswerInput";
import { PRIMARY, QUIET, SECONDARY } from "./buttonStyles";
import countriesData from "../data/countries.json";
import { readTyped } from "../game/typedMatch";
import type { Country } from "../types";

// #64: a typed answer that is a slip gets "Did you mean …?" and is graded
// only once the learner picks.

const AUS = (countriesData as Country[]).find((c) => c.iso3 === "AUS")!;

afterEach(cleanup);

function setup() {
  const onAnswer = vi.fn();
  render(
    <AnswerInput
      mode="shape-to-name"
      current={AUS}
      feedback={null}
      readTyped={(input) => readTyped(input, "location", AUS)}
      onAnswer={onAnswer}
    />,
  );
  const input = screen.getByRole("textbox");
  const type = (text: string) => {
    fireEvent.change(input, { target: { value: text } });
    fireEvent.submit(input.closest("form")!);
  };
  const submit = () => screen.getByRole("button", { name: "Submit" });
  return { onAnswer, input, type, submit };
}

describe("AnswerInput spelling slips", () => {
  it("answers an exact spelling at once", () => {
    const { onAnswer, type } = setup();
    type("Australia");
    expect(onAnswer).toHaveBeenCalledWith("AUS");
    expect(screen.queryByText(/Did you mean/)).toBeNull();
  });

  it("answers a miss with nothing near it at once", () => {
    const { onAnswer, type } = setup();
    type("Atlantis");
    expect(onAnswer).toHaveBeenCalledWith("");
  });

  it("offers a single slip, focused, and grades it on Yes", () => {
    const { onAnswer, type, submit } = setup();
    type("Icland");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(
      screen.getByRole("group", { name: "Did you mean Iceland?" }),
    ).toBeTruthy();
    const yes = screen.getByRole("button", { name: "Yes, Iceland" });
    expect(document.activeElement).toBe(yes);
    // One dark button on screen: Submit steps down while an offer is open.
    expect(yes.className).toBe(PRIMARY);
    expect(submit().className).toContain(SECONDARY);
    fireEvent.click(yes);
    expect(onAnswer).toHaveBeenCalledWith("ISL");
  });

  it("hands the answer back on No, and grades it as typed if resubmitted", () => {
    const { onAnswer, input, type } = setup();
    type("Icland");
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText(/Did you mean/)).toBeNull();
    expect(document.activeElement).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Icland");
    fireEvent.submit(input.closest("form")!);
    expect(onAnswer).toHaveBeenCalledWith("");
  });

  it("offers every candidate with no default, and grades the choice", () => {
    const { onAnswer, input, type } = setup();
    type("Austrlia");
    expect(
      // jsdom joins the italic names without their spaces.
      screen.getByRole("group", {
        name: /^Did you mean Australia\s*or\s*Austria\?$/,
      }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(input);
    for (const name of ["Australia", "Austria"]) {
      expect(screen.getByRole("button", { name }).className).toBe(SECONDARY);
    }
    // Neither is a way out, not a fourth choice.
    expect(screen.getByRole("button", { name: "Neither" }).className).toBe(
      QUIET,
    );
    // Enter again on the same text answers nothing.
    fireEvent.submit(input.closest("form")!);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Austria" }));
    expect(onAnswer).toHaveBeenCalledWith("AUT");
  });

  it("hands the answer back on Neither, and offers again once edited", () => {
    const { onAnswer, type } = setup();
    type("Austrlia");
    fireEvent.click(screen.getByRole("button", { name: "Neither" }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText(/Did you mean/)).toBeNull();
    type("Austrila");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText(/Did you mean/)).toBeTruthy();
  });

  it("closes the offer when the answer is edited", () => {
    const { onAnswer, input, type, submit } = setup();
    type("Icland");
    fireEvent.change(input, { target: { value: "Iceland" } });
    expect(screen.queryByText(/Did you mean/)).toBeNull();
    expect(submit().className).toContain(PRIMARY);
    fireEvent.submit(input.closest("form")!);
    expect(onAnswer).toHaveBeenCalledWith("ISL");
  });

  it("hands the answer back on Escape", () => {
    const { onAnswer, input, type } = setup();
    type("Icland");
    fireEvent.keyDown(screen.getByRole("button", { name: "Yes, Iceland" }), {
      key: "Escape",
    });
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.queryByText(/Did you mean/)).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("treats a differently cased resubmit as the declined answer", () => {
    const { onAnswer, type } = setup();
    type("Icland");
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    type("ICLAND");
    expect(onAnswer).toHaveBeenCalledWith("");
  });

  it("closes an open offer when the question mode changes", () => {
    const onAnswer = vi.fn();
    const props = {
      current: AUS,
      feedback: null,
      readTyped: (input: string) => readTyped(input, "location", AUS),
      onAnswer,
    };
    const { rerender } = render(
      <AnswerInput mode="shape-to-name" {...props} />,
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Icland" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByText(/Did you mean/)).toBeTruthy();
    rerender(<AnswerInput mode="country-to-capital" {...props} />);
    expect(screen.queryByText(/Did you mean/)).toBeNull();
  });

  it("does not accept a single offer on a held Enter", () => {
    const { type } = setup();
    type("Icland");
    const yes = screen.getByRole("button", { name: "Yes, Iceland" });
    const repeated = fireEvent.keyDown(yes, { key: "Enter", repeat: true });
    const fresh = fireEvent.keyDown(yes, { key: "Enter" });
    // fireEvent returns false when the default action was prevented.
    expect(repeated).toBe(false);
    expect(fresh).toBe(true);
  });
});
