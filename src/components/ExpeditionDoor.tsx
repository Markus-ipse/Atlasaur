import type { ExpeditionStatus } from "../game/expedition";
import { EXPEDITION_SIZE } from "../game/expedition";

type Props = {
  status: ExpeditionStatus;
  onClick: () => void;
  className: string;
  subClassName: string;
};

// The one way into the Daily Expedition, shared by the Today card and the
// Study summary so the two doors read the same. The label says what waits
// behind it: a fresh run, one to pick up where it was left, or today's
// result. Never a second go — that is tomorrow.
export function ExpeditionDoor({ status, onClick, className, subClassName }: Props) {
  const label =
    status.kind === "in-progress"
      ? "Resume today's expedition"
      : status.kind === "finished"
        ? "See today's expedition"
        : "Today's expedition";
  const sub =
    status.kind === "in-progress"
      ? `${status.answered} of ${EXPEDITION_SIZE} answered`
      : status.kind === "finished"
        ? `${status.found} of ${EXPEDITION_SIZE} found`
        : `${EXPEDITION_SIZE} countries, the same for everyone`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className + " flex flex-col items-center justify-center leading-tight"
      }
    >
      <span>{label}</span>
      <span className={"text-xs font-normal " + subClassName}>{sub}</span>
    </button>
  );
}
