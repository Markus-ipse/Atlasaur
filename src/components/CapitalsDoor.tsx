import type { CapitalOffer } from "../game/offer";
import { IndexRow } from "./IndexRow";
import { capitalsDoorCopy } from "./capitalsDoorCopy";

type Props = {
  offer: CapitalOffer;
  onClick: () => void;
};

// The way into the capital questions for a learner who has never opened the
// settings, shared by the Today card and the caught-up round break so the two
// read the same — the shape ExpeditionDoor established. The CaughtUp banner
// says the same thing through `capitalsDoorCopy`, as its dark button.
//
// It only ever appears when there is something specific behind it, and the
// figure says what: capitals already met and due again, or capitals for
// countries the learner has already learned to place. Country → Capital
// rather than Capital → Click, because the country is the thing they just
// proved they know — the new question is asked about familiar ground.
export function CapitalsDoor({ offer, onClick }: Props) {
  const { label, figure } = capitalsDoorCopy(offer);
  return <IndexRow label={label} figure={figure} onClick={onClick} />;
}
