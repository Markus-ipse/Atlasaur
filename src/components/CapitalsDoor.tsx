import type { CapitalOffer } from "../game/offer";

type Props = {
  offer: CapitalOffer;
  onClick: () => void;
  className: string;
  subClassName: string;
};

// The way into the capital questions for a learner who has never opened the
// settings, shared by the Today card and the CaughtUp banner so the two read
// the same — the shape ExpeditionDoor established.
//
// It only ever appears when there is something specific behind it, and the
// sub-line says what: capitals already met and due again, or capitals for
// countries the learner has already learned to place. Country → Capital
// rather than Capital → Click, because the country is the thing they just
// proved they know — the new question is asked about familiar ground.
export function CapitalsDoor({ offer, onClick, className, subClassName }: Props) {
  const back = offer.due > 0;
  const label = back ? "Capitals are back" : "Try capitals";
  const sub = back
    ? `${offer.due} coming back`
    : `${offer.ready} ${offer.ready === 1 ? "country" : "countries"} you already know`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className + " flex flex-col items-center justify-center leading-tight"
      }
    >
      <span>{label}</span>
      <span className={"text-xs font-normal " + subClassName}>{sub}</span>
    </button>
  );
}
