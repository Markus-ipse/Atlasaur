import { ALL_CONTINENTS, type Continent, type Fact } from "../types";
import { continentAskable } from "../game/useGame";

// What the figures on these cards are counting. The learner's fact changed
// what "Known 3" means; the copy has to say so, or a capitals learner with a
// fully inked map reads "174 countries still to meet" as lost progress.
export function subject(fact: Fact, n: number): string {
  if (fact === "capital") return n === 1 ? "capital" : "capitals";
  return n === 1 ? "country" : "countries";
}

// The chosen scope, as the copy names it. Only continents with a chip count —
// a selection can keep a hidden one (Antarctica with territories off), which
// asks nothing and so must not be named. Past half the chips, what is left out
// is the shorter thing to say.
type Scope =
  | { kind: "world" }
  | { kind: "in"; names: string }
  | { kind: "except"; names: string };

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function scopeOf(
  continents: readonly Continent[],
  includeTerritories: boolean,
  fact: Fact,
): Scope {
  const selected = new Set(continents);
  const askable = ALL_CONTINENTS.filter((c) =>
    continentAskable(c, includeTerritories, fact),
  );
  const named = askable.filter((c) => selected.has(c));
  const left = askable.filter((c) => !selected.has(c));
  if (named.length === 0 || left.length === 0) return { kind: "world" };
  if (named.length > askable.length / 2) {
    return { kind: "except", names: listOf(left) };
  }
  return { kind: "in", names: listOf(named) };
}

// "South America · 12 countries", "Everywhere but Oceania · 150 countries",
// or "The whole world · 199 countries".
export function scopeLine(
  continents: readonly Continent[],
  includeTerritories: boolean,
  fact: Fact,
  size: number,
): string {
  const scope = scopeOf(continents, includeTerritories, fact);
  const name =
    scope.kind === "world"
      ? "The whole world"
      : scope.kind === "except"
        ? `Everywhere but ${scope.names}`
        : scope.names;
  return `${name} · ${size} ${subject(fact, size)}`;
}

// The test door's label: "Test all 12 countries in South America", "… everywhere
// but Oceania", or "Test all 199 countries" over the whole world.
export function testDoorLabel(
  continents: readonly Continent[],
  includeTerritories: boolean,
  fact: Fact,
  size: number,
): string {
  const scope = scopeOf(continents, includeTerritories, fact);
  const all =
    size === 1 ? `Test the one ${subject(fact, 1)}` : `Test all ${size} ${subject(fact, size)}`;
  if (scope.kind === "world") return all;
  if (scope.kind === "except") return `${all} everywhere but ${scope.names}`;
  return `${all} in ${scope.names}`;
}
