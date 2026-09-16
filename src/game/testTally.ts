// How a test round ("Test me on these") stands, counted in countries.
//
// The scoring model: a test is scored on FIRST attempts. A country answered
// right the first time it was asked counts; one missed first and found later
// — on a retry in the same pass or in the review pass — is recovered, which
// is worth saying but is not the score. The four parts partition the test's
// countries, so they always add up to its size and every surface that shows
// them (the status bar, the round break, the summary) reconciles with the
// others.
//
// Answers are not the unit: the retry queue can ask a country three times,
// and a percentage over answers is what once let "92% Right" sit beside a
// country still listed as missed.
export type TestTally = {
  // Countries in the test: the active scope.
  size: number;
  // Answered right the first time they were asked.
  firstTry: number;
  // Missed at first, answered right later.
  recovered: number;
  // Missed, not yet answered right.
  stillMissed: number;
  // Never asked.
  notAsked: number;
};

export function testTally(
  scope: ReadonlySet<string>,
  completedSet: ReadonlySet<string>,
  missedSet: ReadonlySet<string>,
): TestTally {
  const tally: TestTally = {
    size: scope.size,
    firstTry: 0,
    recovered: 0,
    stillMissed: 0,
    notAsked: 0,
  };
  scope.forEach((iso3) => {
    const found = completedSet.has(iso3);
    const missed = missedSet.has(iso3);
    if (found && !missed) tally.firstTry++;
    else if (found) tally.recovered++;
    else if (missed) tally.stillMissed++;
    else tally.notAsked++;
  });
  return tally;
}

// The one line every test surface speaks, in the same order and words:
// "8 right first try · 1 recovered · 1 to try again · 2 not yet asked".
// Parts at zero are left out, except the score itself.
export function testTallyParts(t: TestTally): string[] {
  const parts = [`${t.firstTry} right first try`];
  if (t.recovered > 0) parts.push(`${t.recovered} recovered`);
  if (t.stillMissed > 0) parts.push(`${t.stillMissed} to try again`);
  if (t.notAsked > 0) parts.push(`${t.notAsked} not yet asked`);
  return parts;
}
