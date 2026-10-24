import { useEffect, useRef } from "react";
import {
  EXPEDITION_SIZE,
  formatDay,
  type ExpeditionStatus,
} from "../game/expedition";
import { PRIMARY, QUIET } from "./buttonStyles";

type Props = {
  // The day the shared link names, and the reader's own today (both
  // YYYY-MM-DD). They differ for an old link, or for one sent from a time
  // zone already in tomorrow.
  linkDay: string;
  today: string;
  // What today already holds for this reader.
  status: ExpeditionStatus;
  // No SRS record yet: the card is the first thing they ever see of the app,
  // so it says what Atlasaur is, and the quiet route leads to the welcome.
  newcomer: boolean;
  onBegin: () => void;
  onElsewhere: () => void;
};

// Where a shared expedition link lands (#57). Opening it costs nothing: the
// attempt starts only on Begin, and nothing of the ten is shown here.
export function ExpeditionInvite({
  linkDay,
  today,
  status,
  newcomer,
  onBegin,
  onElsewhere,
}: Props) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  // A dated link that is not today's says so first: the ten behind Begin
  // are not the ten the sender's score was for.
  const notice =
    linkDay < today
      ? `That link was for ${formatDay(linkDay)}. Every day has its own ten, so today's won't compare with the result you were sent.`
      : linkDay > today
        ? `That link is for ${formatDay(linkDay)}, which hasn't begun where you are. Today's ten are different, so your score won't compare with the one you were sent.`
        : null;

  const heading =
    status.kind === "finished"
      ? `You've done today's: ${status.found} of ${EXPEDITION_SIZE} found.`
      : status.kind === "in-progress"
        ? `You're ${status.answered} of ${EXPEDITION_SIZE} into today's.`
        : "Ten countries to find on the map.";

  const line =
    status.kind === "finished"
      ? "There's one go a day. Tomorrow brings a new ten."
      : status.kind === "in-progress"
        ? "Pick up where you left off. The answers you've given stay as they are."
        : "The same ten for everyone today, and one go each.";

  const begin =
    status.kind === "finished"
      ? "See your result"
      : status.kind === "in-progress"
        ? "Resume today's expedition"
        : "Begin today's ten";

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-scrim/55 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-title"
        aria-describedby="invite-line"
        className="w-full max-w-sm max-h-[90dvh] overflow-y-auto bg-parchment-base rounded-lg shadow-lg p-6 flex flex-col gap-4"
      >
        {newcomer && (
          <div className="self-start relative px-3 py-1 border border-ink-deep font-display">
            <div
              aria-hidden
              className="absolute inset-[3px] border border-ink-deep/70 pointer-events-none"
            />
            <p className="relative text-lg tracking-[0.08em] text-ink-deep leading-tight">
              Atlasaur
            </p>
          </div>
        )}
        <p className="font-display text-xs uppercase tracking-wide text-ink-mid">
          Daily Expedition · {formatDay(today)}
        </p>
        {notice && (
          <p className="-mt-1 rounded border border-ink-faded/40 px-3 py-2 text-sm text-ink-mid italic">
            {notice}
          </p>
        )}
        <h2 id="invite-title" className="text-2xl font-bold text-ink-deep">
          {heading}
        </h2>
        <p id="invite-line" className="-mt-2 text-sm text-ink-mid">
          {line}
          {newcomer && status.kind === "fresh" && (
            <span className="block mt-1">
              Atlasaur is a world map you learn by heart. No account needed.
            </span>
          )}
        </p>
        <div className="flex flex-col gap-2">
          <button
            ref={primaryRef}
            type="button"
            onClick={onBegin}
            className={PRIMARY}
          >
            {begin}
          </button>
          <button type="button" onClick={onElsewhere} className={QUIET}>
            {newcomer ? "Learn the map at my own pace instead" : "Not now"}
          </button>
        </div>
      </div>
    </div>
  );
}
