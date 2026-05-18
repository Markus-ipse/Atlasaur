type Props = {
  onKeepGoing: () => void;
};

export function CaughtUp({ onKeepGoing }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="leading-tight">
        <span className="block text-xs uppercase tracking-wide text-teal-engraving">
          Caught up
        </span>
        <span className="block text-xl font-semibold text-ink-deep">
          You've cleared every due card.
        </span>
        <span className="block text-sm text-ink-mid mt-1">
          Come back later — we'll have more for you.
        </span>
      </p>
      <button
        type="button"
        onClick={onKeepGoing}
        className="self-start min-h-11 px-4 rounded border border-ink-faded text-ink-mid text-sm hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
      >
        Keep practicing anyway
      </button>
    </div>
  );
}
