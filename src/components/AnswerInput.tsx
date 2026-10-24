import { useEffect, useId, useRef, useState } from "react";
import { normalize } from "../data/normalize";
import { factOf } from "../game/questionModes";
import { shownCapitals, type Suggestion, type TypedReading } from "../game/typedMatch";
import type { Country, Feedback, QuestionMode } from "../types";
import { PRIMARY, QUIET, SECONDARY } from "./buttonStyles";
import { KEEP_FOCUS } from "./keepFocus";

type Props = {
  mode: QuestionMode;
  current: Country;
  feedback: Feedback | null;
  // True while the round break is up. The input is disabled underneath
  // the dialog and takes focus back when the break closes — nothing else
  // (current, feedback) changes on "Keep going", so the other refocus
  // effects would not fire.
  paused?: boolean;
  // What the typed answer reads as: the country it names, or the countries
  // it is a slip away from, offered as "Did you mean …?" (#64). The hook
  // picks the fact; this input never branches on it.
  readTyped: (input: string) => TypedReading;
  // Names the neighbours the compact field reads out on a miss, as the
  // panel's "Bordered by" line does.
  nameFromIso3?: (iso3: string) => string;
  onAnswer: (iso3: string) => void;
  // Enter in the input through a miss reveal: the input keeps focus from card
  // to card (#61), so it answers for Continue.
  onContinue: () => void;
  // A phone's dock or rail (#61): one button that is Don't know, Submit or
  // Next as the card goes, the answer shown in the field through feedback
  // instead of a panel above it, and the offer above the field.
  compact?: boolean;
  // Don't know, for the compact layout's one button; the panel has its own.
  onSkip?: () => void;
  // The landscape rail's field is too narrow for the answer and the struck
  // guess together, so there the guess and the capital take the line below.
  detailsBelow?: boolean;
};

// A mouse or trackpad, where the keyboard is a physical one and moving focus
// costs nothing. Without matchMedia (jsdom) the desktop behaviour stands.
function hasFinePointer(): boolean {
  return typeof window.matchMedia !== "function"
    ? true
    : window.matchMedia("(pointer: fine)").matches;
}

export function AnswerInput({
  mode,
  current,
  feedback,
  paused = false,
  readTyped,
  onAnswer,
  onContinue,
  compact = false,
  onSkip,
  detailsBelow = false,
  nameFromIso3,
}: Props) {
  const [value, setValue] = useState("");
  // What was submitted, for the compact field to strike through on a miss:
  // there the field is emptied as the answer goes in, so the next card's
  // text never meets the last one's.
  const [typed, setTyped] = useState("");
  // The open "Did you mean …?" offer, or null. Input state from before any
  // answer, like `value`: it never reaches the game.
  const [offer, setOffer] = useState<Suggestion[] | null>(null);
  // The answer (normalized, as the matcher compares) whose offer the learner
  // turned down. Submitting it again grades it as typed, so declining never
  // traps them in the same offer.
  const [declined, setDeclined] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const questionId = useId();

  useEffect(() => {
    setValue("");
    inputRef.current?.focus({ preventScroll: true });
  }, [current.iso3]);

  // An offer answers one question: a new card or a mode switch (which can
  // keep the card but ask for its capital instead) closes it.
  useEffect(() => {
    setOffer(null);
    setDeclined(null);
  }, [current.iso3, mode]);

  // The input holds focus through the answer and its reveal as well as the
  // question (#61), so a phone keyboard stays up from card to card instead of
  // closing on every answer; Enter here then continues. This also brings focus
  // back after an offer's Yes took it.
  useEffect(() => {
    setOffer(null);
    inputRef.current?.focus({ preventScroll: true });
  }, [feedback]);

  // A single suggestion takes focus, so Enter confirms it. Several leave
  // focus in the input: none is the default, so none is favoured. On a touch
  // screen focus stays in the input whatever the offer, so the keyboard does
  // not drop for it; the learner taps their answer.
  useEffect(() => {
    if (offer?.length === 1 && hasFinePointer())
      yesRef.current?.focus({ preventScroll: true });
  }, [offer]);

  useEffect(() => {
    if (!paused) inputRef.current?.focus({ preventScroll: true });
  }, [paused]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || paused) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const { iso3, suggestions } = readTyped(trimmed);
    // Pressing Enter again on the same text puts up the same offer: an offer
    // is only ever accepted by one of its own buttons.
    if (suggestions.length > 0 && normalize(trimmed) !== declined) {
      setOffer(suggestions);
      return;
    }
    answer(iso3);
  };

  // No and Neither hand the answer back rather than grade it: the learner can
  // fix the spelling, say Don't know, or submit the same text as typed.
  const decline = () => {
    setOffer(null);
    setDeclined(normalize(value));
    inputRef.current?.focus({ preventScroll: true });
  };

  const answer = (iso3: string) => {
    setOffer(null);
    if (compact) {
      setTyped(value.trim());
      setValue("");
    }
    onAnswer(iso3);
  };

  // Through a reveal Enter in the input is Continue. A repeat is the Enter
  // that answered still held down, which would skip the reveal unread. The
  // correct flash moves on by itself, so Enter waits there.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !feedback) return;
    e.preventDefault();
    if (feedback.kind !== "correct" && !e.repeat && !paused) onContinue();
  };

  const input = (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => {
        // Read-only through feedback by ignoring edits rather than by the
        // attribute: iOS drops the keyboard for a readonly input, which is
        // the jump keeping focus here is meant to avoid.
        if (feedback) return;
        setValue(e.target.value);
        setOffer(null);
      }}
      onKeyDown={handleKeyDown}
      aria-readonly={feedback ? true : undefined}
      disabled={paused}
      placeholder={
        // The compact field shows the answer through feedback, over an
        // empty input.
        compact && feedback
          ? ""
          : factOf(mode) === "capital"
            ? compact
              ? "Capital"
              : "Type the capital…"
            : compact
              ? "Country"
              : "Type the country name…"
      }
      autoFocus
      autoCapitalize="none"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      inputMode="text"
      enterKeyHint="go"
      className={
        "flex-1 min-w-0 min-h-11 px-4 text-lg rounded border border-ink-faded bg-parchment-base text-ink-deep placeholder:text-ink-faded focus:outline-none focus:ring-2 focus:ring-ink-deep disabled:bg-parchment-shadow aria-readonly:bg-parchment-shadow aria-readonly:focus:ring-ink-faded" +
        (compact && feedback?.kind === "correct"
          ? " border-sap-green aria-readonly:bg-sap-green/15 aria-readonly:focus:ring-sap-green"
          : "")
      }
    />
  );

  // A phone's one button (#61): Don't know until something is typed, Submit
  // once it is, Next through a miss. The correct flash moves on by itself.
  // One width for all three, so the field does not jump as the label turns.
  const oneButton = feedback ? (
    <button
      type="button"
      {...KEEP_FOCUS}
      onClick={onContinue}
      disabled={feedback.kind === "correct" || paused}
      className={`w-32 shrink-0 ${feedback.kind === "correct" ? SECONDARY : PRIMARY}`}
    >
      Next
    </button>
  ) : value.trim() ? (
    <button
      type="submit"
      {...KEEP_FOCUS}
      disabled={paused}
      className={`w-32 shrink-0 ${offer ? SECONDARY : PRIMARY}`}
    >
      Submit
    </button>
  ) : (
    <button
      type="button"
      {...KEEP_FOCUS}
      onClick={() => {
        setTyped("");
        onSkip?.();
      }}
      disabled={paused}
      className={`w-32 shrink-0 ${SECONDARY}`}
    >
      {"Don't know"}
    </button>
  );

  const offerBlock = (
    // Always mounted, so the offer is announced when it appears.
    <div aria-live="polite">
      {offer && (
        <div
          role="group"
          aria-labelledby={questionId}
          className={
            compact
              ? "flex flex-wrap items-center gap-x-2 gap-y-1"
              : "flex flex-col gap-2"
          }
          // Escape hands the answer back, as No does: a learner who wants to
          // fix the spelling should not have to find the input again.
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              decline();
            }
          }}
        >
          <p id={questionId} className="text-ink-deep">
            Did you mean {offerList(offer)}?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {offer.map((s) => (
              <button
                key={s.iso3}
                // One suggestion is the default and takes focus; several are
                // equals, none favoured.
                ref={offer.length === 1 ? yesRef : undefined}
                type="button"
                {...KEEP_FOCUS}
                onClick={() => answer(s.iso3)}
                // A held Enter repeats onto Yes the moment it takes focus;
                // only a fresh press accepts an offer.
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.repeat) e.preventDefault();
                }}
                className={offer.length === 1 ? PRIMARY : SECONDARY}
              >
                {offer.length === 1 ? `Yes, ${s.label}` : s.label}
              </button>
            ))}
            <button
              type="button"
              {...KEEP_FOCUS}
              onClick={decline}
              className={QUIET}
            >
              {offer.length === 1 ? "No" : "Neither"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {offerBlock}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1 min-w-0 flex">
            {input}
            {feedback && (
              <FieldResult
                current={current}
                mode={mode}
                feedback={feedback}
                typed={typed}
                strike={!detailsBelow}
                nameFromIso3={nameFromIso3}
              />
            )}
          </div>
          {oneButton}
        </form>
        {detailsBelow && feedback && feedback.kind !== "correct" && (
          <MissDetails
            current={current}
            mode={mode}
            feedback={feedback}
            typed={typed}
            nameFromIso3={nameFromIso3}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        {input}
        <button
          type="submit"
          {...KEEP_FOCUS}
          disabled={Boolean(feedback) || paused || !value.trim()}
          // Through a reveal Continue is the one way on, and through an offer
          // its own buttons are, so Submit steps down to an outline rather
          // than a second dark button (#61).
          className={`shrink-0 ${feedback || offer ? SECONDARY : PRIMARY}`}
        >
          Submit
        </button>
      </form>
      {offerBlock}
    </div>
  );
}

// The answer, written in the compact field over the emptied input through
// feedback (#61): a tick and the answer on a correct one; on a miss the
// answer by a swatch of the map's answer green, and what was typed struck
// through at the end. The rest of the panel's reveal is on the map — the
// neighbours are labelled there and the capital is named by its dot — and is
// read out here for a screen reader.
function FieldResult({
  current,
  mode,
  feedback,
  typed,
  strike,
  nameFromIso3,
}: {
  current: Country;
  mode: QuestionMode;
  feedback: Feedback;
  typed: string;
  // False in the rail, which shows the guess on the line below instead.
  strike: boolean;
  nameFromIso3?: (iso3: string) => string;
}) {
  const capitals = shownCapitals(current);
  // Leads with the answer, as RevealHero does: the capital only where the
  // capital was asked for.
  const askedForCapital = mode === "country-to-capital";
  const answer = askedForCapital ? capitals.join(", ") : current.name;
  const elsewhere = capitalOfAnother(mode, feedback, nameFromIso3);
  const lead =
    feedback.kind === "correct"
      ? "Correct:"
      : feedback.kind === "skipped"
        ? "Skipped. The answer:"
        : "You missed. The answer:";
  return (
    <div
      role="status"
      data-field-result={feedback.kind}
      className="absolute inset-0 flex items-center gap-2 px-4 text-lg text-ink-deep pointer-events-none"
    >
      <span className="sr-only">{lead} </span>
      {feedback.kind === "correct" ? (
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          aria-hidden="true"
          className="shrink-0 text-sap-green"
        >
          <path
            d="M3 10.5l4.5 4.5L17 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <span
          aria-hidden="true"
          className="shrink-0 size-3 rounded-sm border-[1.5px] border-ink-deep bg-sap-green"
        />
      )}
      <span className="truncate">{answer}</span>
      {askedForCapital && feedback.kind !== "correct" && (
        <span className="sr-only">
          {capitals.length > 1 ? "Capitals of " : "Capital of "}
          {current.name}.
        </span>
      )}
      {feedback.kind === "wrong" &&
        typed &&
        (strike ? (
          <s className="ml-auto shrink-0 max-w-[45%] truncate text-base text-vermillion">
            <span className="sr-only">You typed </span>
            {typed}
          </s>
        ) : (
          <span className="sr-only">You typed {typed}.</span>
        ))}
      {elsewhere && (
        <span className="sr-only"> That's the capital of {elsewhere}.</span>
      )}
      {!askedForCapital && feedback.kind !== "correct" && capitals.length > 0 && (
        <span className="sr-only">
          {capitals.length > 1 ? "Capitals: " : "Capital: "}
          {capitals.join(", ")}.
        </span>
      )}
      {feedback.kind !== "correct" &&
        nameFromIso3 &&
        current.neighbors.length > 0 && (
          <span className="sr-only">
            {" "}Bordered by:{" "}
            {current.neighbors
              .map(nameFromIso3)
              .sort((a, b) => a.localeCompare(b))
              .join(", ")}
            .
          </span>
        )}
    </div>
  );
}

// A typed capital that belongs to another country resolves to it (#64), so a
// Country → Capital miss can say where the answer would have been right, as
// the panel's reveal does.
function capitalOfAnother(
  mode: QuestionMode,
  feedback: Feedback,
  nameFromIso3?: (iso3: string) => string,
): string | null {
  return mode === "country-to-capital" &&
    feedback.kind === "wrong" &&
    feedback.answerIso3 !== "" &&
    nameFromIso3
    ? nameFromIso3(feedback.answerIso3)
    : null;
}

// Under the rail's field through a miss: what was typed, struck through, and
// the capital where the answer was the country. Read out by the field.
function MissDetails({
  current,
  mode,
  feedback,
  typed,
  nameFromIso3,
}: {
  current: Country;
  mode: QuestionMode;
  feedback: Feedback;
  typed: string;
  nameFromIso3?: (iso3: string) => string;
}) {
  const capitals = shownCapitals(current);
  const showCapitals = mode !== "country-to-capital" && capitals.length > 0;
  const showTyped = feedback.kind === "wrong" && typed !== "";
  const elsewhere = capitalOfAnother(mode, feedback, nameFromIso3);
  if (!showTyped && !showCapitals) return null;
  return (
    <p aria-hidden="true" className="text-sm text-ink-mid">
      {showTyped && (
        <>
          You typed <s className="text-vermillion">{typed}</s>
          {elsewhere && `, the capital of ${elsewhere}`}
        </>
      )}
      {showTyped && showCapitals && " · "}
      {showCapitals &&
        `${capitals.length > 1 ? "Capitals" : "Capital"}: ${capitals.join(", ")}`}
    </p>
  );
}

// "Iceland", "Australia or Austria", "Gambia, Namibia or Zambia", each in
// italic, the emphasis this typeface has.
function offerList(offer: Suggestion[]) {
  return offer.map((s, i) => (
    <span key={s.iso3}>
      {i === 0 ? "" : i === offer.length - 1 ? " or " : ", "}
      <i>{s.label}</i>
    </span>
  ));
}
