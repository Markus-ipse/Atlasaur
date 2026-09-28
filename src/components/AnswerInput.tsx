import { useEffect, useId, useRef, useState } from "react";
import { normalize } from "../data/normalize";
import { factOf } from "../game/questionModes";
import type { Suggestion, TypedReading } from "../game/typedMatch";
import type { Country, Feedback, QuestionMode } from "../types";
import { PRIMARY, QUIET, SECONDARY } from "./buttonStyles";

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
  onAnswer: (iso3: string) => void;
};

export function AnswerInput({
  mode,
  current,
  feedback,
  paused = false,
  readTyped,
  onAnswer,
}: Props) {
  const [value, setValue] = useState("");
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

  useEffect(() => {
    setOffer(null);
    if (!feedback) inputRef.current?.focus({ preventScroll: true });
  }, [feedback]);

  // A single suggestion takes focus, so Enter confirms it. Several leave
  // focus in the input: none is the default, so none is favoured.
  useEffect(() => {
    if (offer?.length === 1) yesRef.current?.focus({ preventScroll: true });
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
    inputRef.current?.blur();
    onAnswer(iso3);
  };

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOffer(null);
          }}
          disabled={Boolean(feedback) || paused}
          placeholder={
            factOf(mode) === "capital"
              ? "Type the capital…"
              : "Type the country name…"
          }
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          enterKeyHint="go"
          className="flex-1 min-w-0 min-h-11 px-4 text-lg rounded border border-ink-faded bg-parchment-base text-ink-deep placeholder:text-ink-faded focus:outline-none focus:ring-2 focus:ring-ink-deep disabled:bg-parchment-shadow"
        />
        <button
          type="submit"
          disabled={Boolean(feedback) || paused || !value.trim()}
          // Through a reveal Continue is the one way on, and through an offer
          // its own buttons are, so Submit steps down to an outline rather
          // than a second dark button (#61).
          className={`shrink-0 ${feedback || offer ? SECONDARY : PRIMARY}`}
        >
          Submit
        </button>
      </form>
      {/* Always mounted, so the offer is announced when it appears. */}
      <div aria-live="polite">
        {offer && (
          <div
            role="group"
            aria-labelledby={questionId}
            className="flex flex-col gap-2"
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
                  // One suggestion is the default and takes focus; several
                  // are equals, none favoured.
                  ref={offer.length === 1 ? yesRef : undefined}
                  type="button"
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
              <button type="button" onClick={decline} className={QUIET}>
                {offer.length === 1 ? "No" : "Neither"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
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
