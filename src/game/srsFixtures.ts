// Test-only helpers for the fact-partitioned SRS store (R3.2). The store
// holds one record map per fact, which most tests do not care about: they
// have a handful of records and one fact in mind. These two keep that intent
// on the page instead of spelling out the `facts` envelope 40 times over.
//
// Not imported by the app. Production code reaches the records it needs
// through `recordsFor` / `learnerFact` in useGame.ts.

import { emptyStore } from "./srs";
import type { Fact, SrsRecords, SrsStore } from "../types";

// A store holding exactly these records under one fact, every other fact
// empty. Defaults to `location`, which is what a test means unless it says
// otherwise.
export function storeWith(
  records: SrsRecords,
  fact: Fact = "location",
): SrsStore {
  const store = emptyStore();
  store.facts[fact] = records;
  return store;
}

// One fact's records out of a store.
export function recordsOf(store: SrsStore, fact: Fact = "location"): SrsRecords {
  return store.facts[fact];
}
