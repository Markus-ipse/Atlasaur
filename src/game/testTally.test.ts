import { describe, expect, it } from "vitest";
import { testTally, testTallyParts } from "./testTally";

const SCOPE = new Set(["ARG", "BRA", "CHL", "PER", "URY"]);

describe("testTally", () => {
  it("partitions the scope into first try, recovered, still missed and not asked", () => {
    const t = testTally(
      SCOPE,
      new Set(["ARG", "BRA", "CHL"]),
      new Set(["CHL", "PER"]),
    );
    expect(t).toEqual({
      size: 5,
      firstTry: 2,
      recovered: 1,
      stillMissed: 1,
      notAsked: 1,
    });
    expect(t.firstTry + t.recovered + t.stillMissed + t.notAsked).toBe(t.size);
  });

  it("counts only the scope, whatever the sets hold beyond it", () => {
    const t = testTally(SCOPE, new Set(["FRA", "ARG"]), new Set(["DEU"]));
    expect(t).toEqual({
      size: 5,
      firstTry: 1,
      recovered: 0,
      stillMissed: 0,
      notAsked: 4,
    });
  });
});

describe("testTallyParts", () => {
  it("keeps the score and leaves out the parts at zero", () => {
    expect(
      testTallyParts({ size: 12, firstTry: 11, recovered: 0, stillMissed: 1, notAsked: 0 }),
    ).toEqual(["11 right first try", "1 to try again"]);
    expect(
      testTallyParts({ size: 12, firstTry: 0, recovered: 0, stillMissed: 0, notAsked: 12 }),
    ).toEqual(["0 right first try", "12 not yet asked"]);
    expect(
      testTallyParts({ size: 12, firstTry: 8, recovered: 2, stillMissed: 1, notAsked: 1 }),
    ).toEqual(["8 right first try", "2 recovered", "1 to try again", "1 not yet asked"]);
  });
});
