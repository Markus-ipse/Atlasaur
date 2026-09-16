import { useEffect, useRef } from "react";
import type { Country, Fact, PracticeMode, SrsStore, Subregion } from "../types";
import {
  lifetimeAccuracy as srsLifetimeAccuracy,
  learnedCount as srsLearnedCount,
  seenCount as srsSeenCount,
  askableBySubregion,
  hasAnyRecord,
  totalReviews as srsTotalReviews,
} from "../game/srs";
import { markerOnlySubregions, pickSpotlight } from "../game/pickCountry";
import type { ExpeditionStatus } from "../game/expedition";
import { ExpeditionDoor } from "./ExpeditionDoor";
import { tallyParts } from "./tallyParts";
import { NO_MORE_NEW, nextBackOrNothing } from "../game/nextBack";

type Props = {
  practiceMode: PracticeMode;
  score: number;
  total: number;
  missed: Country[];
  unlearnedCount: number;
  completedCount: number;
  totalInScope: number;
  dueCount: number;
  // When the next card comes back (nextBackLine), or null.
  nextBack: string | null;
  // Nothing has come back and no new card can be asked (App's caughtUp): the
  // stretch's new cards are used and nothing unseen is left in the pool that
  // closing the summary would refill them for. Keep going brings back old
  // ground rather than new countries.
  caughtUp: boolean;
  // The focus the learner is in, if any. While one is on every Study pick
  // comes from that subregion, so the whole-scope counts say nothing about
  // what Keep going brings next.
  spotlightSubregion: Subregion | null;
  newAvailableCount: number;
  srsStore: SrsStore;
  // The sitting that just ended (Study summary only): every card since the
  // summary last closed.
  sittingCards: number;
  sittingRight: number;
  sittingNew: number;
  // Cards missed earlier in the sitting and later answered right in it.
  sittingRecovered: number;
  // A miss from this sitting is queued and comes back next, so Keep going is
  // not "anyway".
  missQueued: boolean;
  // The latest save of the learning records landed (useGame's save effect), so "kept in this browser" is true.
  progressSaved: boolean;
  // The fact the learner is working on. The scoped figures and the spotlight
  // count over it; the two lifetime rows are across every fact.
  fact: Fact;
  scopeIso3s: ReadonlySet<string>;
  countries: readonly Country[];
  onReview: () => void;
  onPlayAgain: () => void;
  onStartTest: () => void;
  onBackToStudy: () => void;
  onKeepStudying: () => void;
  onSetSpotlight: (subregion: Subregion) => void;
  // The Daily Expedition's door, on the Study summary only.
  expedition: ExpeditionStatus;
  onExpedition: () => void;
};

// What the figures on these cards are counting. The learner's fact changed
// what "Known 3" means; the copy has to say so, or a capitals learner with a
// fully inked map reads "174 countries still to meet" as lost progress.
function subject(fact: Fact, n: number): string {
  if (fact === "capital") return n === 1 ? "capital" : "capitals";
  return n === 1 ? "country" : "countries";
}

export function SessionSummary(props: Props) {
  return props.practiceMode === "study" ? (
    <StudySummary {...props} />
  ) : (
    <TestSummary {...props} />
  );
}

// Summary for a "Test me on these" round (practiceMode "quiz" in code).
function TestSummary({
  score,
  total,
  missed,
  fact,
  unlearnedCount,
  completedCount,
  totalInScope,
  dueCount,
  onReview,
  onPlayAgain,
  onBackToStudy,
}: Props) {
  // No answer, no accuracy: a test ended before its first card is not 0%
  // right, and it is certainly not a clean run.
  const accuracy = total === 0 ? null : Math.round((score / total) * 100);
  // Countries neither answered right nor waiting in the retry queue, so never
  // asked. A test ended early says how much of it was left.
  const notAsked = Math.max(0, totalInScope - completedCount - unlearnedCount);
  const reviewRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const showReview = unlearnedCount > 0;
  const cleared = unlearnedCount === 0 && completedCount === totalInScope;
  const title = cleared ? "Complete!" : "Test over";

  useEffect(() => {
    (showReview ? reviewRef : playAgainRef).current?.focus();
  }, [showReview]);

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-summary-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <h2 id="session-summary-title" className="text-2xl font-bold text-ink-deep">
          {title}
        </h2>
        <div className="grid grid-cols-3 gap-4 text-center">
          <Tile label="Done" value={`${completedCount}/${totalInScope}`} />
          <Tile
            label="Right"
            value={accuracy === null ? "—" : `${accuracy}%`}
          />
          <Tile label="Missed" value={String(missed.length)} />
        </div>
        {dueCount > 0 && (
          <p className="text-xs text-ink-mid text-center">
            {dueCount} coming back — first up when you go back to studying.
          </p>
        )}
        {/* Countries, not answers, so the parts add up to the Done tile's
            denominator: right, waiting to be tried again, never asked. */}
        {total > 0 && notAsked > 0 && (
          <p className="text-sm text-ink-mid tabular-nums">
            {[
              `${completedCount} right`,
              unlearnedCount > 0 && `${unlearnedCount} to try again`,
              `${notAsked} not yet asked`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {total === 0 ? (
          <p className="text-sm text-ink-mid">No questions answered.</p>
        ) : missed.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-ink-deep mb-2">
              Missed ({missed.length}):
            </p>
            <ul className="max-h-[28dvh] overflow-y-auto text-sm text-ink-mid border border-ink-faded/40 rounded p-3 flex flex-wrap gap-x-4 gap-y-1">
              {/* The one screen that says what you got wrong has to show the
                  thing you got wrong: a capital round names the capital
                  beside its country. */}
              {missed.map((c) => (
                <li key={c.iso3}>
                  {fact === "capital" && c.capital !== null
                    ? `${c.name} · ${c.capital}`
                    : c.name}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink-mid">
            {notAsked > 0 ? "No misses." : "No misses — clean run!"}
          </p>
        )}
        <div className="flex flex-col gap-2">
          {showReview && (
            <button
              ref={reviewRef}
              type="button"
              onClick={onReview}
              className={primaryClass}
            >
              Review {unlearnedCount} missed
            </button>
          )}
          <button
            ref={playAgainRef}
            type="button"
            onClick={onPlayAgain}
            className={showReview ? secondaryClass : primaryClass}
          >
            Test again
          </button>
          <button
            type="button"
            onClick={onBackToStudy}
            className={secondaryClass}
          >
            Back to studying
          </button>
        </div>
      </div>
    </div>
  );
}

function StudySummary({
  dueCount,
  nextBack,
  caughtUp,
  spotlightSubregion,
  newAvailableCount,
  totalInScope,
  srsStore,
  sittingCards,
  sittingRight,
  sittingNew,
  sittingRecovered,
  missQueued,
  progressSaved,
  fact,
  scopeIso3s,
  countries,
  onStartTest,
  onKeepStudying,
  onSetSpotlight,
  expedition,
  onExpedition,
}: Props) {
  const factRecords = srsStore.facts[fact];
  const learned = srsLearnedCount(factRecords, scopeIso3s);
  const seen = srsSeenCount(factRecords, scopeIso3s);
  const reviews = srsTotalReviews(srsStore);
  const accuracy = srsLifetimeAccuracy(srsStore);
  // Recommend the most-neglected subregion in scope, if any clears the gate.
  // A subregion drawn only as dots has no frame to focus on: offered last.
  const spotlight = pickSpotlight(
    // Counted over what a focus can ask now (unseen or due), so tapping the
    // door always opens on useful work rather than on a "nothing more" banner.
    askableBySubregion(factRecords, countries, scopeIso3s, new Date()),
    markerOnlySubregions(countries),
  );
  // This is where the learner stops, so nothing that acts takes focus and
  // Enter starts nothing: focus lands on the dialog itself. Escape and the
  // backdrop do nothing either — the app stays at rest until the learner
  // picks a door.
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  const scopeLabel = `${totalInScope} ${subject(fact, totalInScope)}`;

  // What Keep going picks next, in the scheduler's own order: what has come
  // back, then new cards while the stretch's cap allows them. With neither it
  // is "anyway", as on the round break, and says when the next ones come back.
  // During a focus it promises no order at all: the counts are the whole
  // scope's and the picks are the region's.
  // caughtUp already implies nothing has come back.
  // A queued miss is waiting even when nothing is due or new.
  const nothingWaiting =
    !missQueued &&
    (caughtUp || (dueCount === 0 && newAvailableCount === 0));
  const keepGoingLabel =
    nothingWaiting && spotlightSubregion === null
      ? "Keep going anyway"
      : "Keep going";
  const keepGoingSub =
    spotlightSubregion !== null
      ? `Still focusing on ${spotlightSubregion}`
      : dueCount > 0
      ? `${dueCount} coming back first`
      : !nothingWaiting
      ? `New ${subject(fact, 2)} next`
      : caughtUp && newAvailableCount > 0
      ? // Only in a focus now: outside one a spent allowance with unseen
        // countries left is newCapReached, which closing the summary refills.
        // Unseen countries elsewhere are on the tiles, so say why they
        // aren't next.
        `${NO_MORE_NEW} · ${nextBackOrNothing(nextBack)}`
      : nextBackOrNothing(nextBack);

  const stackedSecondaryClass =
    secondaryClass + " flex flex-col items-center justify-center leading-tight";
  const secondarySubClass = "text-xs font-normal text-ink-faded";

  // Only once there is something to keep: a Done before any first answer has
  // nothing in this browser yet.
  const showSaved = progressSaved && hasAnyRecord(srsStore);
  const hasSittingLines = sittingCards > 0 || showSaved;

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-summary-title"
        aria-describedby={hasSittingLines ? "study-summary-sitting" : undefined}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4 focus:outline-none"
      >
        {/* A finish, not a verdict: no "Nice work" over a sitting of misses. */}
        <h2 id="study-summary-title" className="text-2xl font-bold text-ink-deep">
          That's it for now.
        </h2>
        {hasSittingLines && (
          <div
            id="study-summary-sitting"
            className="text-sm text-ink-mid -mt-2 flex flex-col gap-1"
          >
            {/* A miss put right later in the same sitting. Recovered, not
                remembered: it says nothing about next week, so no "known"
                and no "learned". Fact-neutral, since a sitting can span a
                question-mode switch. First, so the ending leads with what
                changed for the learner rather than with accuracy. */}
            {sittingRecovered > 0 && (
              <p>{recoveryLine(sittingRecovered)}</p>
            )}
            {/* The only figures here about the sitting itself; everything
                under the disclosure is a standing or lifetime total. Omitted
                when "Done" was pressed before any answer, rather than reading
                "0 of 0". */}
            {sittingCards > 0 && (
              <p className="tabular-nums">
                This sitting:{" "}
                {tallyParts(sittingRight, sittingCards, sittingNew).join(" · ")}
              </p>
            )}
            {showSaved && <p>Kept in this browser — no account needed.</p>}
          </div>
        )}
        <button
          type="button"
          onClick={onKeepStudying}
          className={stackedSecondaryClass}
        >
          <span>{keepGoingLabel}</span>
          <span className={secondarySubClass}>{keepGoingSub}</span>
        </button>
        {/* Everything else a finished sitting could lead to, out of the way
            of someone who only wants to stop. */}
        <details className="flex flex-col gap-4">
          <summary className="min-h-11 flex items-center justify-center gap-1 cursor-pointer select-none rounded text-sm text-ink-mid hover:text-ink-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1">
            {/* Says what it holds, so a learner looking for a test knows
                where it went. */}
            Figures, focus and tests
          </summary>
          <div className="flex flex-col gap-4 pt-2">
        {/* Two groups, labelled as the settings label them. The first four
            count the learner's fact over the active scope; the last two are
            lifetime totals across every fact and every country, so they
            cannot sit under the same heading. */}
        <section aria-labelledby="study-summary-scoped" className="flex flex-col gap-1">
          <h3
            id="study-summary-scoped"
            className="text-xs text-ink-mid text-center italic"
          >
            {fact === "capital" ? "Capitals" : "Places"}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {/* Unseen first, known after. Not stages that add up: Seen
                includes Known, and Coming back draws on both. */}
            <Tile label="Not yet seen" value={String(newAvailableCount)} />
            <Tile label="Seen" value={String(seen)} />
            <Tile label="Known" value={String(learned)} />
            <Tile label="Coming back" value={String(dueCount)} />
          </div>
        </section>
        <section aria-labelledby="study-summary-lifetime" className="flex flex-col gap-1">
          <h3
            id="study-summary-lifetime"
            className="text-xs text-ink-mid text-center italic"
          >
            All time
          </h3>
          <div className="grid grid-cols-2 gap-3 text-center">
            <Tile label="Answers" value={String(reviews)} />
            <Tile
              label="Right"
              value={accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`}
            />
          </div>
        </section>
        {/* Each door carries its own reason: bare labels left "Focus",
            "Test" and "Keep studying" reading as three names for the same
            thing. */}
        {spotlight && (
          <button
            type="button"
            onClick={() => onSetSpotlight(spotlight.subregion)}
            className={stackedSecondaryClass}
          >
            <span>Focus on {spotlight.subregion}</span>
            <span className={secondarySubClass}>
              {spotlight.remaining} waiting there — just that region
              for now
            </span>
          </button>
        )}
        <section
          aria-labelledby="study-summary-test"
          className="flex flex-col gap-2"
        >
          <h3
            id="study-summary-test"
            className="text-xs text-ink-mid text-center italic"
          >
            Or test yourself
          </h3>
          <button
            type="button"
            onClick={onStartTest}
            className={stackedSecondaryClass}
          >
            <span>Test me on these</span>
            <span className={secondarySubClass}>
              All {scopeLabel}, scored
            </span>
          </button>
          <ExpeditionDoor
            status={expedition}
            onClick={onExpedition}
            className={secondaryClass}
            subClassName="text-ink-faded"
          />
        </section>
          </div>
        </details>
      </div>
    </div>
  );
}

function recoveryLine(n: number): string {
  // Digits, like the sitting's tally directly below it.
  return `You got ${n} right that you'd missed earlier.`;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    // justify-between keeps the figures on one line when a label wraps
    // ("Not yet seen" does, four across).
    <div className="flex flex-col justify-between">
      <span className="font-display text-xs uppercase tracking-wide text-ink-mid">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums text-ink-deep">
        {value}
      </span>
    </div>
  );
}
