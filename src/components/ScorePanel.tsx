import type { TestTally } from "../game/testTally";

const SHELL =
  "flex items-baseline gap-2 text-xs text-ink-mid tabular-nums";
const VALUE = "font-semibold text-ink-deep";

// Test-round chips. The per-session streak used to live here; it left when
// the cross-day streak arrived so there is only one thing called a streak.
// Counted in countries from the same tally as the round break and the
// summary, so a country found on a retry moves from "to try again" into
// "done" here too rather than staying "missed". No fraction: "12/12" beside
// the summary's "First try 11/12" read as two competing scores. The score is
// said on the break and the summary, where its rule is.
export function ScorePanel({ tally }: { tally: TestTally }) {
  return (
    <div className={SHELL}>
      <span>
        <span className={VALUE}>{tally.firstTry + tally.recovered}</span> done
      </span>
      {tally.recovered > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>
            <span className={VALUE}>{tally.recovered}</span> recovered
          </span>
        </>
      )}
      {tally.stillMissed > 0 && (
        <>
          <span aria-hidden>·</span>
          <span>
            <span className={VALUE}>{tally.stillMissed}</span> to try again
          </span>
        </>
      )}
    </div>
  );
}
