type Props = {
  onDismiss: () => void;
};

export function StudyIntro({ onDismiss }: Props) {
  return (
    <div className="relative rounded border border-ochre/40 bg-ochre/15 p-3 pr-8 text-xs leading-snug text-ink-deep">
      <p>
        <span className="font-medium">Study mode.</span> Atlasaur grades
        you automatically and schedules each country to come back at the
        right time. Miss one and you'll see it again shortly.
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
