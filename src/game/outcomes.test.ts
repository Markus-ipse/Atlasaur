// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { QUESTION_MODES } from "../types";
import type { FeedbackKind, Phase, PracticeMode } from "../types";
import {
  appendOutcome,
  clearOutcomes,
  decodeOutcome,
  encodeOutcome,
  loadOutcomes,
  MAX_OUTCOMES_PER_MONTH,
  MODE_CODES,
  monthKey,
  OUTCOME_CODES,
  OUTCOME_KEY_PREFIX,
  PHASE_CODES,
  PRACTICE_CODES,
  type Outcome,
} from "./outcomes";

const AT = new Date(2026, 8, 13, 12, 0, 0).getTime();

function entry(over: Partial<Outcome> = {}): Outcome {
  return {
    at: AT,
    asked: "SVN",
    mode: "name-to-click",
    practice: "study",
    phase: "normal",
    outcome: "wrong",
    given: "SVK",
    ...over,
  };
}

function rawKey(month: string): unknown[] {
  const raw = window.localStorage.getItem(OUTCOME_KEY_PREFIX + month);
  return raw ? (JSON.parse(raw) as { entries: unknown[] }).entries : [];
}

function storedKeys(): string[] {
  const storage = window.localStorage;
  return Array.from({ length: storage.length }, (_, i) => storage.key(i)!).sort();
}

beforeEach(() => window.localStorage.clear());

describe("outcome encoding", () => {
  it("round-trips every mode, practice mode, phase and outcome", () => {
    const practices: PracticeMode[] = ["study", "quiz", "expedition"];
    const phases: Phase[] = ["normal", "review"];
    const kinds: FeedbackKind[] = ["correct", "wrong", "skipped"];
    for (const mode of QUESTION_MODES)
      for (const practice of practices)
        for (const phase of phases)
          for (const outcome of kinds) {
            const e = entry({ mode, practice, phase, outcome });
            expect(decodeOutcome(encodeOutcome(e))).toEqual(e);
          }
  });

  it("stores a compact fixed-position row, to the second", () => {
    expect(encodeOutcome(entry({ at: 1789300000123 }))).toEqual([
      1789300000,
      "SVN",
      "nc",
      "s",
      "n",
      "w",
      "SVK",
    ]);
  });

  it("pins every code, and no table repeats one", () => {
    expect(MODE_CODES).toEqual({
      "name-to-click": "nc",
      "shape-to-name": "sn",
      "capital-to-click": "cc",
      "country-to-capital": "cn",
    });
    expect(PRACTICE_CODES).toEqual({ study: "s", quiz: "q", expedition: "e" });
    expect(PHASE_CODES).toEqual({ normal: "n", review: "r" });
    expect(OUTCOME_CODES).toEqual({ correct: "c", wrong: "w", skipped: "s" });
    for (const table of [MODE_CODES, PRACTICE_CODES, PHASE_CODES, OUTCOME_CODES]) {
      const codes = Object.values(table);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it("rejects rows it cannot read", () => {
    const row = encodeOutcome(entry());
    expect(decodeOutcome([...row.slice(0, 2), "zz", ...row.slice(3)])).toBeNull();
    expect(decodeOutcome(row.slice(0, 6))).toBeNull();
    expect(decodeOutcome(["x", ...row.slice(1)])).toBeNull();
    expect(decodeOutcome({})).toBeNull();
  });
});

describe("outcome storage", () => {
  it("keeps an entry with an unknown code on disk and skips it when read", () => {
    const future = [1789300000, "FRA", "fl", "s", "n", "c", ""];
    window.localStorage.setItem(
      OUTCOME_KEY_PREFIX + "2026-09",
      JSON.stringify({ version: 1, entries: [future] }),
    );
    appendOutcome(entry());
    expect(rawKey("2026-09")).toEqual([future, encodeOutcome(entry())]);
    expect(loadOutcomes()).toEqual([
      { ...entry(), at: Math.floor(AT / 1000) * 1000 },
    ]);
  });

  it("loads malformed and wrong-version blobs as empty", () => {
    window.localStorage.setItem(OUTCOME_KEY_PREFIX + "2026-07", "{nope");
    window.localStorage.setItem(
      OUTCOME_KEY_PREFIX + "2026-08",
      JSON.stringify({ version: 2, entries: [encodeOutcome(entry())] }),
    );
    expect(loadOutcomes()).toEqual([]);
  });

  it("lands an answer in the key for its own local month", () => {
    const lastSecond = new Date(2026, 8, 30, 23, 59, 59).getTime();
    expect(monthKey(lastSecond)).toBe("2026-09");
    appendOutcome(entry({ at: lastSecond }));
    appendOutcome(entry({ at: lastSecond + 1000 }));
    expect(rawKey("2026-09")).toHaveLength(1);
    expect(rawKey("2026-10")).toHaveLength(1);
  });

  it("removes all but the latest 6 month keys when a new month opens", () => {
    for (let month = 0; month < 8; month++) {
      appendOutcome(entry({ at: new Date(2026, month, 15).getTime() }));
    }
    expect(storedKeys()).toEqual(
      ["03", "04", "05", "06", "07", "08"].map(
        (m) => `${OUTCOME_KEY_PREFIX}2026-${m}`,
      ),
    );
  });

  it("trims one key to its newest 5,000 entries", () => {
    const old = encodeOutcome(entry({ asked: "OLD" }));
    window.localStorage.setItem(
      OUTCOME_KEY_PREFIX + "2026-09",
      JSON.stringify({
        version: 1,
        entries: Array.from({ length: MAX_OUTCOMES_PER_MONTH }, () => old),
      }),
    );
    appendOutcome(entry({ asked: "NEW" }));
    const rows = rawKey("2026-09") as unknown[][];
    expect(rows).toHaveLength(MAX_OUTCOMES_PER_MONTH);
    expect(rows[rows.length - 1][1]).toBe("NEW");
  });

  it("re-reads storage on append, so another tab's write is kept", () => {
    appendOutcome(entry({ asked: "FRA" }));
    // Another tab appends between this tab's two answers.
    const other = rawKey("2026-09");
    window.localStorage.setItem(
      OUTCOME_KEY_PREFIX + "2026-09",
      JSON.stringify({
        version: 1,
        entries: [...other, encodeOutcome(entry({ asked: "DEU" }))],
      }),
    );
    appendOutcome(entry({ asked: "ITA" }));
    expect(loadOutcomes().map((o) => o.asked)).toEqual(["FRA", "DEU", "ITA"]);
  });

  it("clears every month key and nothing else", () => {
    appendOutcome(entry({ at: AT }));
    appendOutcome(entry({ at: new Date(2026, 7, 2, 9, 0, 0).getTime() }));
    window.localStorage.setItem("atlasaur:counters:v1", "{}");
    expect(loadOutcomes()).toHaveLength(2);
    clearOutcomes();
    expect(loadOutcomes()).toEqual([]);
    expect(storedKeys()).toEqual(["atlasaur:counters:v1"]);
  });
});
