// The "N of M right · K newly seen" tally, shared by the round break and the
// Study summary's sitting line so the two keep one voice. Pass 0 for `fresh`
// where newly seen does not apply (a test round); it is left out at zero.
export function tallyParts(
  right: number,
  cards: number,
  fresh: number,
): string[] {
  const parts = [`${right} of ${cards} right`];
  if (fresh > 0) parts.push(`${fresh} newly seen`);
  return parts;
}
