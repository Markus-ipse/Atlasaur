// The one "there is more this way" glyph, shared by the index rows and the
// rest card's disclosure so the two cannot drift apart in weight.
export function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}
