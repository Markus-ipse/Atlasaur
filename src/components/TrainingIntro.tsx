type Props = {
  onDismiss: () => void;
};

export function TrainingIntro({ onDismiss }: Props) {
  return (
    <div className="relative rounded border border-blue-200 bg-blue-50 p-3 pr-8 text-xs leading-snug text-blue-900">
      <p>
        <span className="font-medium">Training mode.</span> Grade how
        well you knew it — keys 1/2/3/4 or click. Atlasaur schedules
        each country to come back at the right time.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-1 right-1 w-6 h-6 rounded text-blue-900/60 hover:text-blue-900 hover:bg-blue-100 flex items-center justify-center text-base leading-none"
      >
        ×
      </button>
    </div>
  );
}
