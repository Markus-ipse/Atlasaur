import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ALL_CONTINENTS,
  type Continent,
  type Fact,
  type QuestionMode,
} from "../types";
import { continentAskable } from "../game/useGame";
import type { ThemePref } from "../theme";
import { knownGain, type Counters, type ReturnInfo } from "../game/counters";
import { ContinentChip } from "./ContinentChip";
import { scopeLine } from "./scopeSummary";

type PopupCoords = {
  top: number;
  right: number;
  width: number;
  maxHeight: number;
};

// One plain example per question, printed under its option so every one can
// be read before choosing: choosing mid-round ends the card, and a tooltip is
// out of reach on a touch screen.
const MODE_EXAMPLE: Record<QuestionMode, string> = {
  "name-to-click": "Find Peru",
  "shape-to-name": "Name the country shown",
  "capital-to-click": "Given Lima, find Peru",
  "country-to-capital": "Given Peru, type Lima",
};

function exampleId(mode: QuestionMode): string {
  return `settings-example-${mode}`;
}

// The popup's width where there is room for it, and the gap it keeps from
// either edge of the viewport where there is not.
const POPUP_WIDTH_PX = 288;
const POPUP_GUTTER_PX = 8;

type Props = {
  mode: QuestionMode;
  // The fact the figures below are counted over — the learner's own, which
  // during an expedition is not the mode's.
  fact: Fact;
  onSetMode: (mode: QuestionMode) => void;
  // An expedition is Name → Click only; the picker is shown but inert.
  modeLocked?: boolean;
  selectedContinents: readonly Continent[];
  // How many the selection holds, for the scope line under the chips.
  totalInScope: number;
  onSetContinents: (continents: readonly Continent[]) => void;
  includeTerritories: boolean;
  onSetIncludeTerritories: (value: boolean) => void;
  // SRS surface
  dueCount: number;
  newAvailableCount: number;
  learnedCount: number;
  seenCount: number;
  totalReviews: number;
  lifetimeAccuracy: number | null;
  // Local counters (R2.4) and the days the streak store has recorded. Read
  // only; nothing here leaves the device.
  counters: Counters;
  returns: ReturnInfo;
  onResetSrs: () => void;
  themePref: ThemePref;
  onSetThemePref: (pref: ThemePref) => void;
};

export function SettingsMenu({
  mode,
  fact,
  onSetMode,
  modeLocked = false,
  selectedContinents,
  totalInScope,
  onSetContinents,
  includeTerritories,
  onSetIncludeTerritories,
  dueCount,
  newAvailableCount,
  learnedCount,
  seenCount,
  totalReviews,
  lifetimeAccuracy,
  counters,
  returns,
  onResetSrs,
  themePref,
  onSetThemePref,
}: Props) {
  const pickerNoteId = "settings-question-note";
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopupCoords | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open && confirmReset) setConfirmReset(false);
  }, [open, confirmReset]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      // Anchored to the gear's right edge, but never past either side of the
      // viewport: when the header wraps on a narrow phone the gear lands on
      // the left of a second line, and a right-anchored 288px popup opened
      // off the left edge. On a viewport narrower than the popup plus its
      // gutters it spans the width instead.
      const width = Math.min(POPUP_WIDTH_PX, vw - 2 * POPUP_GUTTER_PX);
      const right = Math.min(
        Math.max(POPUP_GUTTER_PX, vw - rect.right),
        vw - POPUP_GUTTER_PX - width,
      );
      // Always open downward — the gear is now at the top of the viewport in
      // portrait (under the status bar) and at the top of the sidebar in
      // landscape, so down has space in both cases. Constrain max-height so
      // the menu never extends past the viewport; let it scroll internally
      // if its content doesn't fit (e.g. short landscape phones).
      const top = rect.bottom + 8;
      const maxHeight = Math.max(160, window.innerHeight - top - 8);
      setCoords({ top, right, width, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  const handleSetMode = (next: QuestionMode) => {
    onSetMode(next);
    close();
  };

  const selectedSet = new Set(selectedContinents);
  // One predicate behind every chip: a continent with nothing askable under
  // the current setting and fact has no chip. That hides Antarctica while
  // territories are off (it holds only territories) and in a capital mode
  // whether they are on or not (its two rows have no capital). A hidden
  // continent can still be SELECTED — the selection survives the territories
  // toggle until the next chip edit drops it — so the "keep at least one"
  // lock counts visible chips only, and the last
  // visible one can't be switched off to leave an empty pool.
  //
  // The LEARNER's fact, not the mode's: those differ during an expedition,
  // which forces Name → Click, and `applyScope` normalises against the
  // learner's. Reading the mode here would offer a capitals learner an
  // Antarctica chip mid-expedition and then reset their whole selection when
  // they took it.
  const askable = (c: Continent) =>
    continentAskable(c, includeTerritories, fact);
  const visibleSelectedCount = selectedContinents.filter(askable).length;
  // Nothing in the learner's scope has a capital, so a capital mode would
  // have nothing to ask. The selection is never rewritten to make room for
  // one — the two options simply wait.
  const capitalsAskable = selectedContinents.some((c) =>
    continentAskable(c, includeTerritories, "capital"),
  );
  const handleToggleContinent = (continent: Continent) => {
    const isSelected = selectedSet.has(continent);
    if (isSelected && visibleSelectedCount === 1) return;
    // The edit is made against the chips the learner can see, so a hidden
    // continent leaves the selection with it. Otherwise picking South America
    // alone kept Antarctica selected out of sight, and turning territories on
    // then asked about a region the learner never chose. Switching
    // territories off and on again without touching a chip still restores
    // the old scope.
    const next = new Set(selectedContinents.filter(askable));
    if (isSelected) next.delete(continent);
    else next.add(continent);
    onSetContinents(ALL_CONTINENTS.filter((c) => next.has(c)));
  };

  return (
    <div ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full border border-ink-faded text-ink-mid hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
      >
        <GearIcon />
      </button>
      {open && coords &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label="Settings"
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              width: coords.width,
              maxHeight: coords.maxHeight,
            }}
            className="z-50 rounded-lg border border-ink-faded/40 bg-parchment-base shadow-lg p-3 flex flex-col gap-3 overflow-y-auto"
          >
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Question</p>
              {/* One radiogroup, two labelled rows: four options do not fit
                  across a 288px popup, and the split says what each pair
                  teaches. */}
              <div
                role="radiogroup"
                aria-label="Question mode"
                className={
                  "flex flex-col gap-1" + (modeLocked ? " opacity-60" : "")
                }
              >
                <ModeRow label="Countries" pair={["name-to-click", "shape-to-name"]} mode={mode}>
                  <ModeButton
                    active={mode === "name-to-click"}
                    disabled={modeLocked}
                    onClick={() => handleSetMode("name-to-click")}
                    exampleOf="name-to-click"
                    ariaLabel="Countries, on the map"
                  >
                    On the map
                  </ModeButton>
                  <ModeButton
                    active={mode === "shape-to-name"}
                    disabled={modeLocked}
                    onClick={() => handleSetMode("shape-to-name")}
                    exampleOf="shape-to-name"
                    ariaLabel="Countries, by typing"
                  >
                    By typing
                  </ModeButton>
                </ModeRow>
                <ModeRow label="Capitals" pair={["capital-to-click", "country-to-capital"]} mode={mode}>
                  <ModeButton
                    active={mode === "capital-to-click"}
                    describedBy={pickerNoteId}
                    disabled={modeLocked || !capitalsAskable}
                    onClick={() => handleSetMode("capital-to-click")}
                    exampleOf="capital-to-click"
                    ariaLabel="Capitals, on the map"
                  >
                    On the map
                  </ModeButton>
                  <ModeButton
                    active={mode === "country-to-capital"}
                    describedBy={pickerNoteId}
                    disabled={modeLocked || !capitalsAskable}
                    onClick={() => handleSetMode("country-to-capital")}
                    exampleOf="country-to-capital"
                    ariaLabel="Capitals, by typing"
                  >
                    By typing
                  </ModeButton>
                </ModeRow>
              </div>
              {/* The reason an option is unavailable, tied to the options it
                  explains so a screen reader reaches it too. */}
              {modeLocked ? (
                <p id={pickerNoteId} className="text-xs text-ink-mid mt-1">
                  An expedition always asks you to find countries on the map, anywhere in the world.
                </p>
              ) : (
                !capitalsAskable && (
                  <p id={pickerNoteId} className="text-xs text-ink-mid mt-1">
                    Nothing in this scope has a capital.
                  </p>
                )
              )}
            </div>
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Continents</p>
              <div role="group" aria-label="Continents" className="flex flex-wrap gap-1">
                {ALL_CONTINENTS.filter(askable).map((continent) => {
                  const active = selectedSet.has(continent);
                  const lockedLast = active && visibleSelectedCount === 1;
                  return (
                    <ContinentChip
                      key={continent}
                      active={active}
                      disabled={lockedLast}
                      title={
                        lockedLast ? "At least one continent must be selected" : undefined
                      }
                      onClick={() => handleToggleContinent(continent)}
                    >
                      {continent}
                    </ContinentChip>
                  );
                })}
              </div>
              <p className="text-xs text-ink-mid mt-1">
                {scopeLine(selectedContinents, includeTerritories, fact, totalInScope)}
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-deep cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTerritories}
                  onChange={(e) => onSetIncludeTerritories(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-faded text-ink-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep"
                />
                <span>
                  Include territories
                  <span className="block text-xs text-ink-mid">
                    Greenland, Puerto Rico, Antarctica and the like
                  </span>
                </span>
              </label>
            </div>
            <div>
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Theme</p>
              <div
                role="radiogroup"
                aria-label="Theme"
                className="flex gap-1 p-1 rounded-full border border-ink-faded/40 bg-parchment-shadow"
              >
                <ModeButton
                  active={themePref === "system"}
                  onClick={() => onSetThemePref("system")}
                >
                  System
                </ModeButton>
                <ModeButton
                  active={themePref === "light"}
                  onClick={() => onSetThemePref("light")}
                >
                  Light
                </ModeButton>
                <ModeButton
                  active={themePref === "dark"}
                  onClick={() => onSetThemePref("dark")}
                >
                  Dark
                </ModeButton>
              </div>
            </div>
            <div className="pt-2 mt-1 border-t border-ink-faded/30">
              <p className="font-display text-xs uppercase tracking-wide text-ink-mid mb-1">Data</p>
              {/* One record per country AND fact, so these four are counted
                  over the fact the learner is working on and say which. The
                  two below are lifetime totals across every fact and every
                  country, headed "All time" as the Study summary heads them. */}
              <p className="text-xs text-ink-mid mb-1 italic">
                {fact === "capital" ? "Capitals" : "Places"}
              </p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-mid tabular-nums mb-2">
                {/* The same order as the Study summary's tiles: unseen
                    first, known after. The counts overlap, so they don't sum. */}
                <span>Not yet seen</span>
                <span className="text-ink-deep font-medium text-right">
                  {newAvailableCount}
                </span>
                <span>Seen</span>
                <span className="text-ink-deep font-medium text-right">
                  {seenCount}
                </span>
                <span>Known</span>
                <span className="text-ink-deep font-medium text-right">
                  {learnedCount}
                </span>
                <span>Coming back</span>
                <span className="text-ink-deep font-medium text-right">
                  {dueCount}
                </span>
              </div>
              <p className="text-xs text-ink-mid mb-1 italic">All time</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-mid tabular-nums mb-3">
                <span>Answers</span>
                <span className="text-ink-deep font-medium text-right">
                  {totalReviews}
                </span>
                <span>Right</span>
                <span className="text-ink-deep font-medium text-right">
                  {lifetimeAccuracy === null
                    ? "—"
                    : `${Math.round(lifetimeAccuracy * 100)}%`}
                </span>
              </div>
              <MeasuredRows counters={counters} returns={returns} />
              {confirmReset ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-ink-mid">
                    This erases every country's record. There is no undo.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onResetSrs();
                        setConfirmReset(false);
                      }}
                      className="flex-1 min-h-11 px-3 rounded bg-vermillion text-parchment-base text-sm font-medium hover:bg-wax-red focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:ring-offset-1"
                    >
                      Erase
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="flex-1 min-h-11 px-3 rounded border border-ink-faded text-ink-mid text-sm hover:bg-parchment-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep focus-visible:ring-offset-1"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="w-full min-h-11 px-3 rounded border border-vermillion/40 text-vermillion text-sm hover:bg-vermillion/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vermillion focus-visible:ring-offset-1"
                >
                  Erase all progress…
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

// One row of the question picker: a small label and the pair of options it
// names. The pill sits inside the row, so the two rows read as one control.
function ModeRow({
  label,
  pair,
  mode,
  children,
}: {
  label: string;
  // The two questions in this row, whose examples sit under their options.
  pair?: readonly [QuestionMode, QuestionMode];
  mode?: QuestionMode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-xs text-ink-mid">{label}</span>
        <div className="flex flex-1 gap-1 p-1 rounded-full border border-ink-faded/40 bg-parchment-shadow">
          {children}
        </div>
      </div>
      {pair && (
        <div className="flex gap-2">
          <span className="w-16 shrink-0" />
          <div className="flex flex-1 gap-1 px-1">
            {pair.map((m) => (
              <p
                key={m}
                id={exampleId(m)}
                className={
                  "flex-1 text-xs leading-tight text-center " +
                  (m === mode ? "text-ink-deep" : "text-ink-mid")
                }
              >
                {MODE_EXAMPLE[m]}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  disabled = false,
  describedBy,
  ariaLabel,
  exampleOf,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  // The visible label repeats across rows ("On the map"), so the row's name
  // goes into the accessible one.
  ariaLabel?: string;
  // Id of the note saying why this option is unavailable, when there is one.
  describedBy?: string;
  // The question this option asks, whose printed example describes it.
  exampleOf?: QuestionMode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={ariaLabel}
      aria-describedby={
        [exampleOf && exampleId(exampleOf), disabled && describedBy]
          .filter(Boolean)
          .join(" ") || undefined
      }
      disabled={disabled}
      onClick={onClick}
      className={
        "flex-1 min-h-9 px-2 whitespace-nowrap rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep disabled:opacity-50 disabled:cursor-not-allowed " +
        (active ? "bg-ink-deep text-parchment-base" : "text-ink-mid hover:bg-parchment-base")
      }
    >
      {children}
    </button>
  );
}

function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

// The survey's "What to measure" list, in the same Data view the learner
// already reads their own numbers from. Every figure is local; nothing here is
// sent anywhere. Rows are omitted rather than shown as zero when there is not
// yet anything to say, so a first-day profile does not read as a report card.
function MeasuredRows({
  counters,
  returns,
}: {
  counters: Counters;
  returns: ReturnInfo;
}) {
  const { daysPlayed, longestGap, capped } = returns;
  const gained = knownGain(counters, 7, new Date());
  const { roundsStarted, roundsFinished } = counters;
  // Two independent cuts of the same answers: how they were given, and what
  // they were about. Each adds up to the same total.
  const by = counters.answersByQuestionMode;
  const clicks = by["name-to-click"] + by["capital-to-click"];
  const typed = by["shape-to-name"] + by["country-to-capital"];
  const places = by["name-to-click"] + by["shape-to-name"];
  const capitals = by["capital-to-click"] + by["country-to-capital"];
  const answered = clicks + typed;

  const rows: [string, string][] = [];
  if (daysPlayed > 0) {
    // "400+" once the streak store has started dropping its oldest days: the
    // figure is a floor from then on, and saying 400 would understate.
    rows.push(["Days played", capped ? `${daysPlayed}+` : String(daysPlayed)]);
  }
  // A trimmed history may have lost one end of the longest gap, so the figure
  // is no longer trustworthy and is dropped rather than shown too small.
  if (longestGap !== null && !capped) {
    rows.push([
      "Longest gap",
      longestGap === 0 ? "None" : `${longestGap} ${longestGap === 1 ? "day" : "days"}`,
    ]);
  }
  // Zero means there is nothing to report rather than a session of no cards:
  // either the sitting is still in progress, or the profile predates the
  // counters key and its real first session was never measured.
  if (counters.firstSessionEnded && counters.firstSessionAnswers > 0) {
    rows.push(["First session", `${counters.firstSessionAnswers} cards`]);
  }
  if (roundsStarted > 0) {
    rows.push(["Rounds finished", `${roundsFinished} of ${roundsStarted}`]);
  }
  if (gained !== null) {
    rows.push(["Known this week", gained >= 0 ? `+${gained}` : String(gained)]);
  }
  if (answered > 0) {
    // One half is derived from the other so the pair always reads 100%.
    const clickShare = Math.round((clicks / answered) * 100);
    rows.push(["Click / type", `${clickShare}% / ${100 - clickShare}%`]);
  }
  // Only once there is a mix to report: before the first capital answer the
  // row would say "100% / 0%" about a choice the learner has not made.
  if (capitals > 0) {
    const placeShare = Math.round((places / answered) * 100);
    rows.push(["Places / capitals", `${placeShare}% / ${100 - placeShare}%`]);
  }
  const studyRounds = counters.roundsByPractice.study;
  const testRounds = counters.roundsByPractice.quiz;
  if (studyRounds + testRounds > 0) {
    rows.push(["Study / test rounds", `${studyRounds} / ${testRounds}`]);
  }
  const expeditions = counters.roundsByPractice.expedition;
  if (expeditions > 0) {
    rows.push(["Expeditions", String(expeditions)]);
  }
  if (rows.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-ink-mid tabular-nums mb-3 pt-2 border-t border-ink-faded/20">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <span>{label}</span>
          <span className="text-ink-deep font-medium text-right">{value}</span>
        </Fragment>
      ))}
    </div>
  );
}
