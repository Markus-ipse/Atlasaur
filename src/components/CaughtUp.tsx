import { CapitalsDoor } from "./CapitalsDoor";
import type { CapitalOffer } from "../game/offer";

type Props = {
  onKeepGoing: () => void;
  // Capitals worth offering, or null. This banner fires at the one moment a
  // learner has demonstrably run out of work, so an offer here is earned
  // rather than advertised.
  capitalOffer: CapitalOffer | null;
  onTryCapitals: () => void;
};

export function CaughtUp({ onKeepGoing, capitalOffer, onTryCapitals }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="leading-tight">
        <span className="block font-display text-xs uppercase tracking-wide text-teal-engraving">
          Caught up
        </span>
        <span className="block text-xl font-semibold text-ink-deep">
          You've cleared every due card.
        </span>
        {/* "Come back later" is only true when there is nothing else to do.
            Once capitals are on offer it is a promise the app is breaking in
            the same breath it makes it. */}
        <span className="block text-sm text-ink-mid mt-1">
          {capitalOffer
            ? "There's another way to know these places."
            : "Come back later — we'll have more for you."}
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
          Keep practicing anyway
        </button>
      </div>
    </div>
  );
}
