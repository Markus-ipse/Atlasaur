import countriesData from "../data/countries.json";
import { normalize } from "../data/normalize";
import type { Country, Fact } from "../types";

// Everything a typed answer is matched against: the exact match, which
// grades, and the near match, which only ever offers (#64). Both read the
// same spelling tables, so an offer can never name a spelling the exact match
// would not accept, and `readTyped` is the one place that puts them in order.

const COUNTRIES = countriesData as Country[];

// The capitals the app shows for a country: the capital and any alternates,
// which are real capitals too. The reveal, the correct panel and an offer's
// label all name these, so they cannot drift apart.
export function shownCapitals(country: Country): string[] {
  if (country.capital === null) return [];
  return [country.capital, ...(country.capitalAlternates ?? [])];
}

// One accepted spelling, normalized, with the words an offer shows for it.
// An alias is accepted but never displayed, so its label is the country's
// name or the capital it stands for; an alternate capital is a real one and
// shows as itself ("Did you mean Cape Town?").
export type Spelling = {
  iso3: string;
  normalized: string;
  label: string;
};

// What an offer shows: the country the choice answers, and its words.
export type Suggestion = { iso3: string; label: string };

const NAME_SPELLINGS: Spelling[] = COUNTRIES.flatMap((c) =>
  [c.name, ...c.aliases].map((s) => ({
    iso3: c.iso3,
    normalized: normalize(s),
    label: c.name,
  })),
);

// Every spelling of a capital that counts as typing it: the shown capitals
// and the aliases, which are accepted but never displayed.
const CAPITAL_SPELLINGS: Spelling[] = COUNTRIES.flatMap((c) => {
  const capital = c.capital;
  if (capital === null) return [];
  const shown = shownCapitals(c);
  // An alias is labelled with the shown capital it shortens ("Kotte" is
  // Sri Jayawardenepura Kotte, not Colombo), or else the primary.
  const labelFor = (alias: string) =>
    shown.find((cap) => normalize(cap).includes(normalize(alias))) ?? capital;
  return [...shown, ...(c.capitalAliases ?? [])].map((s) => ({
    iso3: c.iso3,
    normalized: normalize(s),
    label: shown.includes(s) ? s : labelFor(s),
  }));
});

export function matchTypedName(input: string): string {
  const n = normalize(input);
  if (!n) return "";
  return NAME_SPELLINGS.find((s) => s.normalized === n)?.iso3 ?? "";
}

// The country a typed capital names, or "" for no match. `current` is checked
// first so a correct answer never resolves elsewhere; after that the whole
// list, so a wrong capital resolves to the country it actually belongs to and
// the map can paint and label THAT country red — the same courtesy
// Shape → Name already does for a wrong country name.
export function matchTypedCapital(input: string, current: Country): string {
  const n = normalize(input);
  if (!n) return "";
  const match =
    CAPITAL_SPELLINGS.find(
      (s) => s.iso3 === current.iso3 && s.normalized === n,
    ) ?? CAPITAL_SPELLINGS.find((s) => s.normalized === n);
  return match?.iso3 ?? "";
}

// Optimal-string-alignment distance of at most one: equal, or one letter
// inserted, deleted, substituted, or two adjacent letters swapped.
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // Substitution, or a swap of the first differing pair.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return (
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2)
    );
  }
  // One is a letter longer: skip that letter in the longer one.
  return a.length > b.length
    ? a.slice(i + 1) === b.slice(i)
    : a.slice(i) === b.slice(i + 1);
}

// Shorter spellings are abbreviations (UK, US, RSA, ROC, ROK, DRC) that sit a
// letter apart from each other, so an offer between them would be noise.
const MIN_NEAR_LENGTH = 4;
// A slip that could be more countries than this is not a slip.
const MAX_OFFERED = 3;

// The countries a typed answer is one slip away from, to offer as "Did you
// mean …?" — never to grade. Asked only once the exact match has found
// nothing (see readTyped): an exact spelling is one edit from its close pair
// (Iran, Iraq) and must never be offered the other. Empty when nothing is a
// slip away or when more than MAX_OFFERED countries are. One suggestion per
// country, sorted by label, so the order never hints at the answer.
export function nearMatches(
  input: string,
  spellings: readonly Spelling[],
): Suggestion[] {
  const n = normalize(input);
  if (!n) return [];
  const found = new Map<string, string>();
  for (const s of spellings) {
    if (
      !found.has(s.iso3) &&
      s.normalized.length >= MIN_NEAR_LENGTH &&
      withinOneEdit(n, s.normalized)
    ) {
      found.set(s.iso3, s.label);
    }
  }
  if (found.size > MAX_OFFERED) return [];
  return [...found]
    .map(([iso3, label]) => ({ iso3, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// What a typed answer reads as: the country it names (`iso3`, "" for none)
// and, only when it names none, the countries it is a slip away from. An
// exact spelling always wins, which is what keeps Iran/Iraq and Niger/Nigeria
// apart.
export type TypedReading = { iso3: string; suggestions: Suggestion[] };

export function readTyped(
  input: string,
  fact: Fact,
  current: Country,
): TypedReading {
  const iso3 =
    fact === "capital"
      ? matchTypedCapital(input, current)
      : matchTypedName(input);
  if (iso3) return { iso3, suggestions: [] };
  return {
    iso3,
    suggestions: nearMatches(
      input,
      fact === "capital" ? CAPITAL_SPELLINGS : NAME_SPELLINGS,
    ),
  };
}
