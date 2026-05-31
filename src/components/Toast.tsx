type Props = {
  message: string;
};

// One-shot transient notification (currently only "Spotlight cleared").
// Positioned top-center below the StatusBar; auto-dismiss is owned by the
// useGame hook's timer, so this component just renders whatever message is
// passed. The fade-in honours prefers-reduced-motion via the `toast-fade`
// CSS class in index.css. Scoped to this single use case — not a queue.
export function Toast({ message }: Props) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-20 flex justify-center px-4">
      <div
        role="status"
        className="toast-fade max-w-md rounded-md border border-ink-faded bg-parchment-base px-4 py-2 text-sm text-ink-deep shadow-lg"
      >
        {message}
      </div>
    </div>
  );
}
