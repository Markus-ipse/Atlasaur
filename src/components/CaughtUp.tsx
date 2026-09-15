import { CapitalsDoor } from "./CapitalsDoor";
import type { CapitalOffer } from "../game/offer";

type Props = {
  onKeepGoing: () => void;
  // Capitals worth offering, or null. This banner fires at the one moment a
  // learner has demonstrably run out of work, so an offer here is earned
  // rather than advertised.
  capitalOffer: CapitalOffer | null;
  onTryCapitals: () => void;
  // When the next card comes back (nextBackLine), or null.
  nextBack: string | null;
  // Unseen countries remain: the banner is up because this stretch's new
  // cards are used up, not because there is nothing left to meet.
  newLeft: boolean;
};

export function CaughtUp({
  onKeepGoing,
  capitalOffer,
  onTryCapitals,
  nextBack,
  newLeft,
}: Props) {
  // "Come back later" is only true when there is nothing else to do, and
  // vaguer than the app needs to be: say when, and once capitals are on
  // offer, say that too.
  const line = [
    newLeft && "No more new ones for now.",
    nextBack && `${nextBack}.`,
    capitalOffer &&
      (nextBack
        ? "Meanwhile, there's another way to know these places."
        : "There's another way to know these places."),
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-2">
      <p className="leading-tight">
        <span className="block font-display text-xs uppercase tracking-wide text-teal-engraving">
          Caught up
        </span>
        {/* Not an achievement: a missed card leaves the due count for a few
            minutes, so "you cleared them all" could be false. And the banner
            shows in capital modes too, so nothing about places. */}
        <span className="block text-xl font-semibold text-ink-deep">
          Nothing more has come back for now.
        </span>
        <span className="block text-sm text-ink-mid mt-1">
          {line || "Come back later — we'll have more for you."}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {capitalOffer && (
          <CapitalsDoor
            offer={capitalOffer}
            onClick={onTryCapitals}
            className="min-h-11 px-4 rounded bg-ink-deep text-parchment-base text-sm font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
            subClassName="text-parchment-shadow"
          />
        )}
        <button
          type="button"
          onClick={onKeepGoing}
          className="min-h-11 px-4 rounded border border-ink-faded text-ink-mid text-sm hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
        >
          Keep going anyway
        </button>
      </div>
    </div>
  );
}
