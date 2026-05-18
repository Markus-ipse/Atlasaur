// Title cartouche for the chart. Rendered as a DOM overlay on the map
// wrapper so it sits in the actual viewport corner regardless of how the
// SVG content is letterboxed inside the viewport. Decorative — pointer-
// events disabled so it never intercepts country clicks.

export function Wordmark() {
  return (
    <div
      role="img"
      aria-label="Atlasaur"
      className="pointer-events-none absolute top-2 left-2 select-none"
    >
      <div
        className="relative px-3 py-1 bg-parchment-base/70 border border-ink-deep"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {/* Inner rule — classic double-line cartouche frame */}
        <div
          aria-hidden
          className="absolute inset-[3px] border border-ink-deep/70 pointer-events-none"
        />
        {/* Corner dots — tiny ink ornaments inside each corner of the
            inner rule. */}
        {(
          [
            "top-[6px] left-[6px]",
            "top-[6px] right-[6px]",
            "bottom-[6px] left-[6px]",
            "bottom-[6px] right-[6px]",
          ] as const
        ).map((pos) => (
          <span
            key={pos}
            aria-hidden
            className={`absolute ${pos} w-[3px] h-[3px] rounded-full bg-ink-deep/70`}
          />
        ))}
        <span className="relative block text-base sm:text-lg tracking-[0.08em] text-ink-deep leading-tight">
          Atlasaur
        </span>
      </div>
    </div>
  );
}
