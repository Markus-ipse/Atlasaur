import { useEffect, useRef, useState } from "react";
import type { Country, Feedback } from "../types";

type Props = {
  current: Country;
  feedback: Feedback | null;
  matchTypedAnswer: (input: string) => string;
  onAnswer: (iso3: string) => void;
};

export function AnswerInput({
  current,
  feedback,
  matchTypedAnswer,
  onAnswer,
}: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue("");
    inputRef.current?.focus();
  }, [current.iso3]);

  useEffect(() => {
    if (!feedback) inputRef.current?.focus();
  }, [feedback]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const iso3 = matchTypedAnswer(trimmed);
    onAnswer(iso3);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={Boolean(feedback)}
        placeholder="Type the country name…"
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
        className="flex-1 min-h-11 px-4 text-lg rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
      />
      <button
        type="submit"
        disabled={Boolean(feedback) || !value.trim()}
        className="min-h-11 px-5 rounded bg-slate-900 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Submit
      </button>
    </form>
  );
}
