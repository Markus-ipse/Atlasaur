type Props = {
  onDismiss: () => void;
};

export function StudyIntro({ onDismiss }: Props) {
  return (
    <div className="relative rounded border border-ochre/40 bg-ochre/15 p-3 pr-8 text-xs leading-snug text-ink-deep">
      {/* Shown on the first Study miss in any question mode, so it says
          "known", the stat word, and nothing about places or the map. */}
      <p>
        <span className="font-medium">Nothing to grade.</span> Atlasaur marks
        each answer itself. Miss one and it's back in a few cards; get it
        right and it comes back later, further out each time, until it's
        known.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-1 right-1 w-6 h-6 rounded text-ink-mid hover:text-ink-deep hover:bg-ochre/25 flex items-center justify-center text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}
