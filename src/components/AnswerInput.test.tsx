// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnswerInput } from "./AnswerInput";
import { PRIMARY, QUIET, SECONDARY } from "./buttonStyles";
import countriesData from "../data/countries.json";
import { readTyped } from "../game/typedMatch";
import type { Country, Feedback } from "../types";

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
      onContinue={() => {}}
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
      onContinue: () => {},
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

const MISS: Feedback = { kind: "wrong", answerIso3: "", correctIso3: "AUS", at: 0 };
const HIT: Feedback = { kind: "correct", answerIso3: "AUS", correctIso3: "AUS", at: 0 };

// #61: the input keeps focus from question to reveal to the next card, so a
// phone keyboard stays up instead of closing on every answer.
function setupFeedback() {
  const onAnswer = vi.fn();
  const onContinue = vi.fn();
  const props = {
    mode: "shape-to-name" as const,
    current: AUS,
    readTyped: (input: string) => readTyped(input, "location", AUS),
    onAnswer,
    onContinue,
  };
  const view = render(<AnswerInput {...props} feedback={null} />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  const showFeedback = (feedback: Feedback | null) =>
    view.rerender(<AnswerInput {...props} feedback={feedback} />);
  return { onAnswer, onContinue, input, showFeedback };
}

describe("AnswerInput through a reveal", () => {
  it("keeps focus in the input, read-only, while feedback is up", () => {
    const { input, showFeedback } = setupFeedback();
    fireEvent.change(input, { target: { value: "Atlantis" } });
    showFeedback(MISS);
    expect(document.activeElement).toBe(input);
    // Not disabled: a disabled input drops focus, and the keyboard with it.
    expect(input.disabled).toBe(false);
    expect(input.getAttribute("aria-readonly")).toBe("true");
    fireEvent.change(input, { target: { value: "Australia" } });
    expect(input.value).toBe("Atlantis");
  });

  it("continues on Enter through a miss, but not on a held one", () => {
    const { input, onContinue, onAnswer, showFeedback } = setupFeedback();
    showFeedback(MISS);
    fireEvent.keyDown(input, { key: "Enter", repeat: true });
    expect(onContinue).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("waits through the correct flash, which moves on by itself", () => {
    const { input, onContinue, showFeedback } = setupFeedback();
    showFeedback(HIT);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("takes focus back from an offer's Yes once the answer is graded", () => {
    const { input, onAnswer, showFeedback } = setupFeedback();
    fireEvent.change(input, { target: { value: "Icland" } });
    fireEvent.submit(input.closest("form")!);
    screen.getByRole("button", { name: "Yes, Iceland" }).click();
    expect(onAnswer).toHaveBeenCalledWith("ISL");
    showFeedback(MISS);
    expect(document.activeElement).toBe(input);
  });

  it("leaves focus in the input for an offer on a touch screen", () => {
    const matchMedia = vi.fn(() => ({ matches: false }) as MediaQueryList);
    vi.stubGlobal("matchMedia", matchMedia);
    try {
      const { input } = setupFeedback();
      input.focus();
      fireEvent.change(input, { target: { value: "Icland" } });
      fireEvent.submit(input.closest("form")!);
      expect(screen.getByRole("button", { name: "Yes, Iceland" })).toBeTruthy();
      expect(matchMedia).toHaveBeenCalledWith("(pointer: fine)");
      expect(document.activeElement).toBe(input);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps a tap on its buttons from taking focus", () => {
    const { input } = setupFeedback();
    fireEvent.change(input, { target: { value: "Icland" } });
    fireEvent.submit(input.closest("form")!);
    for (const name of ["Submit", "Yes, Iceland", "No"]) {
      // fireEvent returns false when the default (moving focus) was prevented.
      expect(fireEvent.mouseDown(screen.getByRole("button", { name }))).toBe(false);
    }
  });
});

// #61: on a phone the field sits on the keyboard with one button, and the
// answer is written in the field rather than in a panel above it.
function setupCompact(detailsBelow = false) {
  const onAnswer = vi.fn();
  const onSkip = vi.fn();
  const onContinue = vi.fn();
  const props = {
    compact: true,
    detailsBelow,
    mode: "shape-to-name" as const,
    current: AUS,
    readTyped: (input: string) => readTyped(input, "location", AUS),
    onAnswer,
    onSkip,
    onContinue,
  };
  const { rerender } = render(<AnswerInput {...props} feedback={null} />);
  const input = screen.getByRole("textbox") as HTMLInputElement;
  const showFeedback = (feedback: Feedback | null) =>
    rerender(<AnswerInput {...props} feedback={feedback} />);
  return { onAnswer, onSkip, onContinue, input, showFeedback };
}

describe("AnswerInput on a phone", () => {
  it("has one button: Don't know, then Submit once something is typed", () => {
    const { input, onSkip } = setupCompact();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Don't know" }));
    expect(onSkip).toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "Aus" } });
    expect(screen.getByRole("button", { name: "Submit" }).className).toContain(
      PRIMARY,
    );
    expect(screen.queryByRole("button", { name: "Don't know" })).toBeNull();
  });

  it("empties the field as the answer goes in and writes the answer there on a miss", () => {
    const { input, onAnswer, onContinue, showFeedback } = setupCompact();
    fireEvent.change(input, { target: { value: "Atlantis" } });
    fireEvent.submit(input.closest("form")!);
    expect(onAnswer).toHaveBeenCalledWith("");
    expect(input.value).toBe("");
    showFeedback(MISS);
    const result = screen.getByRole("status");
    expect(result.textContent).toContain("Australia");
    expect(result.querySelector("s")?.textContent).toContain("Atlantis");
    expect(result.textContent).toContain("Capital: Canberra");
    expect(document.activeElement).toBe(input);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onContinue).toHaveBeenCalled();
  });

  it("ticks a correct answer in the field and waits for the flash", () => {
    const { input, showFeedback } = setupCompact();
    fireEvent.change(input, { target: { value: "Australia" } });
    fireEvent.submit(input.closest("form")!);
    showFeedback(HIT);
    expect(screen.getByRole("status").textContent).toContain("Australia");
    expect(
      (screen.getByRole("button", { name: "Next" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("puts the guess and the capital under a narrow field", () => {
    const { input, showFeedback } = setupCompact(true);
    fireEvent.change(input, { target: { value: "Atlantis" } });
    fireEvent.submit(input.closest("form")!);
    showFeedback(MISS);
    expect(screen.getByRole("status").querySelector("s")).toBeNull();
    const below = screen.getByRole("status").parentElement!.parentElement!
      .nextElementSibling!;
    expect(below.textContent).toBe("You typed Atlantis · Capital: Canberra");
  });

  it("puts an offer above the field", () => {
    const { input } = setupCompact();
    fireEvent.change(input, { target: { value: "Icland" } });
    fireEvent.submit(input.closest("form")!);
    const offer = screen.getByRole("group", { name: "Did you mean Iceland?" });
    expect(
      offer.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("says whose capital a wrong typed capital is", () => {
    const props = {
      compact: true,
      detailsBelow: true,
      mode: "country-to-capital" as const,
      current: AUS,
      readTyped: (input: string) => readTyped(input, "capital", AUS),
      nameFromIso3: (iso3: string) =>
        iso3 === "NZL" ? "New Zealand" : iso3,
      onAnswer: vi.fn(),
      onContinue: vi.fn(),
    };
    const { rerender } = render(<AnswerInput {...props} feedback={null} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Wellington" } });
    fireEvent.submit(input.closest("form")!);
    expect(props.onAnswer).toHaveBeenCalledWith("NZL");
    rerender(
      <AnswerInput
        {...props}
        feedback={{ kind: "wrong", answerIso3: "NZL", correctIso3: "AUS", at: 0 }}
      />,
    );
    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Canberra");
    expect(status.textContent).toContain("That's the capital of New Zealand.");
    expect(
      status.parentElement!.parentElement!.nextElementSibling!.textContent,
    ).toBe("You typed Wellington, the capital of New Zealand");
  });
});

