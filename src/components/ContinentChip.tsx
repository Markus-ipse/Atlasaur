// Toggle chip for one continent. Shared by the settings menu and the
// first-run welcome so the two scope pickers look and behave the same.
export function ContinentChip({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={active}
      aria-disabled={disabled || undefined}
      title={title}
      onClick={disabled ? undefined : onClick}
      className={
        "min-h-9 px-3 rounded-full text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep " +
        (active
          ? "bg-ink-deep text-parchment-base border-ink-deep"
          : "bg-parchment-base text-ink-mid border-ink-faded hover:bg-parchment-shadow") +
        (disabled ? " cursor-not-allowed opacity-70" : "")
      }
    >
      {children}
    </button>
  );
}
