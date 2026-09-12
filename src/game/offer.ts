// What Atlasaur can offer a learner beyond the fact they are working on.
//
// R3.2 added two capital questions, and nothing outside the settings menu
// says so. Rather than advertise them, the app waits until it has something
// specific and earned to offer — which is the same reasoning the ceremony
// follows: mark the moment, don't sell the feature.

import type { Country, SrsStore } from "../types";
import { isDue, masteryTierOf } from "./srs";

export type CapitalOffer = {
  // Capital cards already met and due again.
  due: number;
  // Capitals not met yet, for countries the learner can ALREADY place. The
  // gate is the whole idea: knowing where Peru is, is exactly what makes
  // "what is its capital" the next sensible question, and it keeps the
  // number small and true — a learner three countries in is offered three
  // capitals, not the whole atlas.
  ready: number;
};

export function capitalOffer(
  store: SrsStore,
  countries: readonly Country[],
  scope: ReadonlySet<string>,
  now: Date,
): CapitalOffer | null {
  const location = store.facts.location;
  const capital = store.facts.capital;
  let due = 0;
  let ready = 0;
  for (const c of countries) {
    // Out of scope, or nothing to ask (Antarctica, the French Southern
    // Territories) — filterPool drops these from a capital pool too.
    if (!scope.has(c.iso3) || c.capital === null) continue;
    const rec = capital[c.iso3];
    if (rec) {
      if (isDue(rec, now)) due++;
      continue;
    }
    if (masteryTierOf(location[c.iso3]) === 2) ready++;
  }
  return due + ready > 0 ? { due, ready } : null;
}
