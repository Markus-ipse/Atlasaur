import { useEffect, useRef, useState } from "react";
import type { Country, Feedback } from "../types";

type Props = {
  current: Country;
  feedback: Feedback | null;
  // True while the round break is up. The input is disabled underneath
  // the dialog and takes focus back when the break closes — nothing else
  // (current, feedback) changes on "Keep going", so the other refocus
  // effects would not fire.
  paused?: boolean;
  matchTypedAnswer: (input: string) => string;
  onAnswer: (iso3: string) => void;
};

export function AnswerInput({
  current,
  feedback,
  paused = false,
  matchTypedAnswer,
  onAnswer,
}: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue("");
    inputRef.current?.focus({ preventScroll: true });
  }, [current.iso3]);

  useEffect(() => {
    if (!feedback) inputRef.current?.focus({ preventScroll: true });
  }, [feedback]);

  useEffect(() => {
    if (!paused) inputRef.current?.focus({ preventScroll: true });
  }, [paused]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback || paused) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const iso3 = matchTypedAnswer(trimmed);
    inputRef.current?.blur();
    onAnswer(iso3);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={Boolean(feedback) || paused}
        placeholder="Type the country name…"
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
        className="flex-1 min-h-11 px-4 text-lg rounded border border-ink-faded bg-parchment-base text-ink-deep placeholder:text-ink-faded focus:outline-none focus:ring-2 focus:ring-ink-deep disabled:bg-parchment-shadow"
      />
      <button
        type="submit"
        disabled={Boolean(feedback) || paused || !value.trim()}
        className="min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Submit
      </button>
    </form>
  );
}
