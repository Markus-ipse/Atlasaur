type Props = {
  onKeepGoing: () => void;
};

export function CaughtUp({ onKeepGoing }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="leading-tight">
        <span className="block text-xs uppercase tracking-wide text-emerald-700">
          Caught up
        </span>
        <span className="block text-xl font-semibold text-slate-900">
          You've cleared every due card.
        </span>
        <span className="block text-sm text-slate-600 mt-1">
          Come back later — we'll have more for you.
        </span>
      </p>
      <button
        type="button"
        onClick={onKeepGoing}
        className="self-start min-h-11 px-4 rounded border border-slate-300 text-slate-700 text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        Keep practicing anyway
      </button>
    </div>
  );
}
