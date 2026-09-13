import { useEffect, useRef } from "react";
import type { Country, Fact, PracticeMode, SrsStore, Subregion } from "../types";
import {
  lifetimeAccuracy as srsLifetimeAccuracy,
  learnedCount as srsLearnedCount,
  seenCount as srsSeenCount,
  masteryBySubregion,
  totalReviews as srsTotalReviews,
} from "../game/srs";
import { markerOnlySubregions, pickSpotlight } from "../game/pickCountry";
import type { ExpeditionStatus } from "../game/expedition";
import { ExpeditionDoor } from "./ExpeditionDoor";

type Props = {
  practiceMode: PracticeMode;
  score: number;
  total: number;
  missed: Country[];
  unlearnedCount: number;
  completedCount: number;
  totalInScope: number;
  dueCount: number;
  newAvailableCount: number;
  srsStore: SrsStore;
  // The sitting that just ended (Study summary only): every card since the
  // summary last closed.
  sittingCards: number;
  sittingRight: number;
  sittingNew: number;
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
  const accuracy = total === 0 ? 0 : Math.round((score / total) * 100);
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
          <Tile label="Right" value={`${accuracy}%`} />
          <Tile label="Missed" value={String(missed.length)} />
        </div>
        {dueCount > 0 && (
          <p className="text-xs text-ink-mid text-center">
            {dueCount} to review when you go back to studying.
          </p>
        )}
        {missed.length > 0 ? (
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
          <p className="text-sm text-ink-mid">No misses — clean run!</p>
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
  newAvailableCount,
  totalInScope,
  srsStore,
  sittingCards,
  sittingRight,
  sittingNew,
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
    masteryBySubregion(factRecords, countries, scopeIso3s),
    markerOnlySubregions(countries),
  );
  // Auto-focus the recommended action: the Focus CTA when a spotlight is
  // offered, otherwise Start quiz.
  const focusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKeepStudying();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKeepStudying]);

  const primaryClass =
    "min-h-11 px-5 rounded bg-ink-deep text-parchment-base font-medium flex flex-col items-center justify-center leading-tight hover:bg-ink-mid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";
  const secondaryClass =
    "min-h-11 px-5 rounded border border-ink-faded text-ink-mid font-medium hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1";

  const hint = spotlight
    ? `${spotlight.subregion} has ${spotlight.remaining} left to learn — focus there?`
    : dueCount > 0
    ? `${dueCount} to review — keep going, or test yourself on what you know.`
    : newAvailableCount > 0
    ? `${newAvailableCount} ${subject(
        fact,
        newAvailableCount,
      )} still to meet — keep going, or test yourself.`
    : "All caught up for now — test yourself, or come back tomorrow.";

  const scopeLabel = `${totalInScope} ${subject(fact, totalInScope)}`;

  // Worded as the round break words a round, so the two read as one voice.
  const sittingParts = [`${sittingRight} of ${sittingCards} right`];
  if (sittingNew > 0) sittingParts.push(`${sittingNew} newly seen`);

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onKeepStudying();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-summary-title"
        aria-describedby={
          sittingCards > 0
            ? "study-summary-sitting study-summary-hint"
            : "study-summary-hint"
        }
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        <h2 id="study-summary-title" className="text-2xl font-bold text-ink-deep">
          Nice work
        </h2>
        {/* The only figures here about the sitting itself; everything below
            is a standing or lifetime total. Omitted when "Done" was pressed
            before any answer, rather than reading "0 of 0". */}
        {sittingCards > 0 && (
          <p
            id="study-summary-sitting"
            className="text-sm text-ink-mid tabular-nums -mt-2"
          >
            This sitting: {sittingParts.join(" · ")}
          </p>
        )}
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
            <Tile label="Known" value={String(learned)} />
            <Tile label="Seen" value={String(seen)} />
            <Tile label="To review" value={String(dueCount)} />
            <Tile label="Not yet seen" value={String(newAvailableCount)} />
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
        <p
          id="study-summary-hint"
          className="text-sm text-ink-mid text-center"
        >
          {hint}
        </p>
        <div className="flex flex-col gap-2">
          {spotlight && (
            <button
              ref={focusRef}
              type="button"
              onClick={() => onSetSpotlight(spotlight.subregion)}
              className={primaryClass}
            >
              <span>Focus on {spotlight.subregion}</span>
            </button>
          )}
          <button
            ref={spotlight ? undefined : focusRef}
            type="button"
            onClick={onStartTest}
            className={
              spotlight
                ? secondaryClass +
                  " flex flex-col items-center justify-center leading-tight"
                : primaryClass
            }
          >
            <span>Test me on these</span>
            <span
              className={
                spotlight
                  ? "text-xs font-normal text-ink-faded"
                  : "text-xs font-normal text-parchment-base/70"
              }
            >
              {scopeLabel}
            </span>
          </button>
          <ExpeditionDoor
            status={expedition}
            onClick={onExpedition}
            className={secondaryClass}
            subClassName="text-ink-faded"
          />
          <button
            type="button"
            onClick={onKeepStudying}
            className={secondaryClass}
          >
            Keep studying
          </button>
        </div>
      </div>
    </div>
  );
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
