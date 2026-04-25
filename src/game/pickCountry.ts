import type { Country } from "../types";

export function pickCountry(
  pool: readonly Country[],
  exclude: string | null,
): Country {
  if (pool.length === 0) {
    throw new Error("Cannot pick from an empty country pool");
  }
  if (pool.length === 1) return pool[0];

  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (exclude && pick.iso3 === exclude) {
    pick = pool[Math.floor(Math.random() * pool.length)];
  }
  return pick;
}
