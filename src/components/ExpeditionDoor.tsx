import type { ExpeditionStatus } from "../game/expedition";
import { EXPEDITION_SIZE } from "../game/expedition";
import { IndexRow } from "./IndexRow";

type Props = {
  status: ExpeditionStatus;
  onClick: () => void;
};

// The one way into the Daily Expedition, shared by the Today card and the
// Study summary so the two doors read the same. The label says what waits
// behind it: a fresh run, one to pick up where it was left, or today's
// result. Never a second go — that is tomorrow; the result card's look at the
// misses changes nothing on the row.
export function ExpeditionDoor({ status, onClick }: Props) {
  const label =
    status.kind === "in-progress"
      ? "Resume today's expedition"
      : status.kind === "finished"
        ? "See today's expedition"
        : "Today's expedition";
  // "One try" is the thing to know before starting: there is no second go.
  // That it is the same ten for everyone is what the share text shows.
  const figure =
    status.kind === "in-progress"
      ? `${status.answered} of ${EXPEDITION_SIZE} answered`
      : status.kind === "finished"
        ? `${status.found} of ${EXPEDITION_SIZE} found`
        : `${EXPEDITION_SIZE} countries, one try`;
  return <IndexRow label={label} figure={figure} onClick={onClick} />;
}
