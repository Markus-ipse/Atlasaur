import type { CapitalOffer } from "../game/offer";

// What the capitals door says: the row's label and figure, and the same
// reason as a sentence for the CaughtUp banner, which draws the door as its
// dark button and puts the reason in its own line instead (#61).
export function capitalsDoorCopy(offer: CapitalOffer): {
  label: string;
  figure: string;
  sentence: string;
} {
  const back = offer.due > 0;
  if (back) {
    return {
      label: "Capitals are back",
      figure: `${offer.due} coming back`,
      sentence: `${offer.due} ${offer.due === 1 ? "capital is" : "capitals are"} back.`,
    };
  }
  // "Place" is safe here: `ready` is countries at location tier 2 by
  // construction. Beside "Try capitals", "24 you know" would read as capitals
  // you know, the opposite of the offer.
  const known = `${offer.ready} ${offer.ready === 1 ? "country" : "countries"} you already know`;
  return {
    label: "Try capitals",
    figure: `${offer.ready} you can place`,
    sentence: `Capitals are ready for ${known}.`,
  };
}
