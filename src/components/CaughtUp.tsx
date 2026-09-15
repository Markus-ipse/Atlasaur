import { CapitalsDoor } from "./CapitalsDoor";
import type { CapitalOffer } from "../game/offer";
import type { Subregion } from "../types";
import { NO_MORE_NEW } from "../game/nextBack";

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
  // The focus the learner is in, if any. The banner then means only that the
  // region has nothing useful left: the rest of the scope can already have
  // cards back, so it names the region and says nothing about when the next
  // ones come back (nextBack counts the whole scope).
  spotlightSubregion: Subregion | null;
  // Leaves the focus. Offered only in one, where "nothing more" is true of
  // the region alone and the rest of the scope may have work waiting.
  onLeaveFocus: () => void;
};

export function CaughtUp({
  onKeepGoing,
  capitalOffer,
  onTryCapitals,
  nextBack,
  newLeft,
  spotlightSubregion,
  onLeaveFocus,
}: Props) {
  const inFocus = spotlightSubregion !== null;
  const when = inFocus ? null : nextBack;
  // "Come back later" is only true when there is nothing else to do, and
  // vaguer than the app needs to be: say when, and once capitals are on
  // offer, say that too.
  const line = [
    newLeft && `${NO_MORE_NEW}.`,
    when && `${when}.`,
    capitalOffer &&
      `${when ? "Meanwhile, there's" : "There's"} another way to know these places.`,
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
          {inFocus
            ? `Nothing more in ${spotlightSubregion} for now.`
            : "Nothing more has come back for now."}
        </span>
        {(line || !inFocus) && (
          <span className="block text-sm text-ink-mid mt-1">
            {line || "Come back later — we'll have more for you."}
          </span>
        )}
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
        {inFocus && (
          <button
            type="button"
            onClick={onLeaveFocus}
            className="min-h-11 px-4 rounded bg-ink-deep text-parchment-base text-sm font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
          >
            Back to all regions
          </button>
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
