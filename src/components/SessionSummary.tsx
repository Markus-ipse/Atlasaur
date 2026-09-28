import { useEffect, useRef, useState } from "react";
import type {
  Continent,
  Country,
  Fact,
  PracticeMode,
  SrsStore,
  Subregion,
} from "../types";
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
import type { TestTally } from "../game/testTally";
import { ExpeditionDoor } from "./ExpeditionDoor";
import { tallyParts } from "./tallyParts";
import {
  COMING_BACK_FIRST,
  COMING_BACK_TIP,
  EXPLAINED_LABEL_CLASS,
  KNOWN_TIP,
} from "./figureTips";
import { subject, testDoorLabel } from "./scopeSummary";
import { NO_MORE_NEW, nextBackOrNothing } from "../game/nextBack";

type Props = {
  practiceMode: PracticeMode;
  // A test round's standing, in countries (testTally.ts).
  test: TestTally;
  // Countries missed at first in a test round, in the order they were missed.
  missed: Country[];
  // Countries answered right in the test so far; a missed one in here was
  // recovered.
  foundIso3s: ReadonlySet<string>;
  unlearnedCount: number;
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
  // The scope in the learner's own terms, for the test door's label.
  selectedContinents: readonly Continent[];
  includeTerritories: boolean;
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

export function SessionSummary(props: Props) {
  return props.practiceMode === "study" ? (
    <StudySummary {...props} />
  ) : (
    <TestSummary {...props} />
  );
}

// Summary for a test round (practiceMode "quiz" in code).
// Scored on first tries, in countries (testTally.ts): the same four parts
// the status bar and the round break show, so the figures reconcile.
function TestSummary({
  test,
  missed,
  foundIso3s,
  fact,
  unlearnedCount,
  dueCount,
  scopeIso3s,
  onReview,
  onPlayAgain,
  onBackToStudy,
}: Props) {
  const asked = test.firstTry + test.recovered + test.stillMissed;
  const reviewRef = useRef<HTMLButtonElement>(null);
  const playAgainRef = useRef<HTMLButtonElement>(null);
  const showReview = unlearnedCount > 0;
  const cleared = unlearnedCount === 0 && test.stillMissed === 0 && test.notAsked === 0;
  const title = cleared ? "Complete!" : "Test over";
  // Only the test's current countries, as the tiles count them: a region
  // switched off mid-test takes its misses out of the list too, or the list
  // would name a country the tiles no longer count. Still missed first:
  // those are what "Review N missed" is about.
  const missedInScope = missed.filter((c) => scopeIso3s.has(c.iso3));
  const missedInOrder = [
    ...missedInScope.filter((c) => !foundIso3s.has(c.iso3)),
    ...missedInScope.filter((c) => foundIso3s.has(c.iso3)),
  ];

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
        {asked === 0 ? (
          // No answer, no score: a test ended before its first card is not
          // 0 right, and it is certainly not a clean run.
          <p className="text-sm text-ink-mid">No questions answered.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 text-center">
              <Tile label="First try" value={`${test.firstTry}/${test.size}`} />
              <Tile label="Recovered" value={String(test.recovered)} />
              <Tile label="Still missed" value={String(test.stillMissed)} />
            </div>
            {/* The scoring model, said once where the score is. */}
            <p className="text-xs text-ink-mid text-center -mt-2">
              Scored on first tries. A country found on a later try is
              recovered.
            </p>
            {test.notAsked > 0 && (
              <p className="text-sm text-ink-mid tabular-nums">
                {test.notAsked} not yet asked.
              </p>
            )}
          </>
        )}
        {dueCount > 0 && (
          <p className="text-xs text-ink-mid text-center">
            {dueCount} coming back — first up when you go back to studying.
          </p>
        )}
        {missedInScope.length > 0 ? (
          <div>
            <p className="text-sm font-medium text-ink-deep mb-2">
              Missed at first ({missedInScope.length}):
            </p>
            <ul className="max-h-[28dvh] overflow-y-auto text-sm text-ink-mid border border-ink-faded/40 rounded p-3 flex flex-wrap gap-x-4 gap-y-1">
              {/* The one screen that says what you got wrong has to show the
                  thing you got wrong: a capital round names the capital
                  beside its country. */}
              {missedInOrder.map((c) => (
                <li key={c.iso3}>
                  {fact === "capital" && c.capital !== null
                    ? `${c.name} · ${c.capital}`
                    : c.name}
                  {foundIso3s.has(c.iso3) && (
                    <span className="italic text-ink-faded"> — recovered</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          asked > 0 && (
            <p className="text-sm text-ink-mid">
              {test.firstTry === test.size
                ? "No misses — clean run!"
                : "No misses."}
            </p>
          )
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
  selectedContinents,
  includeTerritories,
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

  // At most one figure's explanation is open at a time.
  const [openTip, setOpenTip] = useState<"known" | "due" | null>(null);

  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

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
        <details className="group flex flex-col border-t border-ink-faded/30 pt-2">
          <summary className="min-h-11 flex items-center justify-center gap-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden rounded text-sm text-ink-mid hover:text-ink-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1">
            {/* Says what it holds, so a learner looking for a test knows
                where it went. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 10 10"
              className="w-2.5 h-2.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
            >
              <path d="M3 1.5 L7 5 L3 8.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            Figures, focus and tests
          </summary>
          <div className="flex flex-col gap-4 pt-1">
        {/* Two groups in one panel, labelled as the settings label them. The
            first four count the learner's fact over the active scope; the
            last two are lifetime totals across every fact and every country,
            so they cannot sit under the same heading. */}
        <div className="rounded border border-ink-faded/40 bg-parchment-shadow/40 px-3 py-3 flex flex-col gap-3">
        <section aria-labelledby="study-summary-scoped" className="relative flex flex-col gap-2">
          <h3
            id="study-summary-scoped"
            className="text-xs text-ink-mid text-center italic"
          >
            {fact === "capital" ? "Capitals" : "Places"}
          </h3>
          <div className="grid grid-cols-4 gap-2 text-center">
            {/* Unseen first, known after. Not stages that add up: Seen
                includes Known, and Coming back draws on both. */}
            <Tile label="Not yet seen" value={String(newAvailableCount)} />
            <Tile label="Seen" value={String(seen)} />
            <Tile
              label="Known"
              value={String(learned)}
              tip={{ id: "study-summary-tip-known", text: KNOWN_TIP, caretAt: 62.5 }}
              open={openTip === "known"}
              onToggle={(open) => setOpenTip(open ? "known" : null)}
            />
            <Tile
              label="Coming back"
              value={String(dueCount)}
              tip={{
                id: "study-summary-tip-due",
                text:
                  COMING_BACK_TIP +
                  (spotlightSubregion === null ? COMING_BACK_FIRST : ""),
                caretAt: 87.5,
              }}
              open={openTip === "due"}
              onToggle={(open) => setOpenTip(open ? "due" : null)}
            />
          </div>
        </section>
        <section
          aria-labelledby="study-summary-lifetime"
          className="flex flex-col gap-2 border-t border-ink-faded/30 pt-3"
        >
          <h3
            id="study-summary-lifetime"
            className="text-xs text-ink-mid text-center italic"
          >
            All time
          </h3>
          <div className="grid grid-cols-2 gap-2 text-center">
            <Tile label="Answers" value={String(reviews)} />
            <Tile
              label="Right"
              value={accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`}
            />
          </div>
        </section>
        </div>
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
            <span>
              {testDoorLabel(
                selectedContinents,
                includeTerritories,
                fact,
                totalInScope,
              )}
            </span>
            <span className={secondarySubClass}>Scored on first tries</span>
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

// caretAt: where the tile sits across the panel, as a percentage, so the
// explanation (which spans the panel) points back at the figure it explains.
type TileTip = { id: string; text: string; caretAt: number };

function Tile({
  label,
  value,
  tip,
  open = false,
  onToggle,
}: {
  label: string;
  value: string;
  tip?: TileTip;
  open?: boolean;
  onToggle?: (open: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // A tap outside closes it, as does Escape; the dialog itself ignores
  // Escape, so this is the only thing it does here.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onToggle?.(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle?.(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onToggle]);

  const labelClass =
    "font-display text-xs uppercase tracking-wide text-ink-mid leading-tight";
  // The figure is drawn above its label (flex-col-reverse) so a label that
  // wraps ("Not yet seen", four across) never pushes its figure out of line
  // with the others; the DOM keeps label then figure, the reading order.
  const stackClass = "flex flex-col-reverse justify-end gap-1";
  const figure = (
    <span className="text-xl tabular-nums text-ink-deep">{value}</span>
  );

  if (!tip) {
    return (
      <div className={stackClass}>
        <span className={labelClass}>{label}</span>
        {figure}
      </div>
    );
  }

  return (
    // Hover opens it for a mouse only (a touch would open it on the way in
    // and the tap would toggle it straight shut), and it stays open while the
    // pointer is anywhere over the tile or its explanation.
    <div
      ref={ref}
      onPointerEnter={(e) => e.pointerType === "mouse" && onToggle?.(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onToggle?.(false)}
    >
      {/* The whole tile is the button, so the target is a thumb's width. */}
      <button
        type="button"
        aria-describedby={tip.id}
        aria-expanded={open}
        // A mouse click lands on a tile hover already opened: keep it open
        // rather than toggle it shut. A tap or a key toggles.
        onClick={(e) =>
          onToggle?.(
            (e.nativeEvent as PointerEvent).pointerType === "mouse" || !open,
          )
        }
        className={`${stackClass} w-full min-h-11 rounded cursor-help hover:bg-parchment-base/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep`}
      >
        {/* Dotted, with a small "?" mark that says there is more to read. */}
        <span
          className={`${labelClass} ${EXPLAINED_LABEL_CLASS}`}
        >
          {label}
        </span>
        {figure}
      </button>
      {/* Transparent padding bridges the gap to the tile, so a mouse moving
          down onto the text never leaves the tile on the way. */}
      <span
        id={tip.id}
        role="tooltip"
        className={`${open ? "" : "hidden "}absolute left-0 right-0 top-full z-10 pt-2`}
      >
        <span className="relative block rounded border border-ink-faded/60 bg-parchment-base px-3 py-2 text-xs text-ink-mid text-left shadow-md">
          <span
            aria-hidden="true"
            className="absolute -top-[5px] w-2 h-2 -ml-1 rotate-45 border-l border-t border-ink-faded/60 bg-parchment-base"
            style={{ left: `${tip.caretAt}%` }}
          />
          {tip.text}
        </span>
      </span>
    </div>
  );
}
