type Props = {
  onDismiss: () => void;
};

export function TrainingIntro({ onDismiss }: Props) {
  return (
    <div className="relative rounded border border-ochre/40 bg-ochre/15 p-3 pr-8 text-xs leading-snug text-ink-deep">
      <p>
        <span className="font-medium">Training mode.</span> Grade how
        well you knew it — keys 1/2/3/4 or click. Atlasaur schedules
        each country to come back at the right time.
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
