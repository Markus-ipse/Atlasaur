import type { ReactNode } from "react";
import { ROW, ROW_FIGURE, ROW_LEADER } from "./buttonStyles";
import { Chevron } from "./Chevron";

type Props = {
  label: ReactNode;
  // The reason for taking this route, as a short figure: "7 of 10 found",
  // "19 waiting", "150 countries". Never a sentence — that goes in the
  // card's copy. Omitted, the row is the label alone, no leader.
  figure?: string;
  onClick: () => void;
  className?: string;
};

// A secondary route drawn as an entry in an index: label, dotted leader,
// figure, chevron (#61). The one shape for every "way on" that has a reason,
// so the reason always has room and a list of routes reads as one list.
//
// The leader, figure and chevron are one flex item, so when the label and
// the figure cannot share a line (a 320 px phone, a long scope name) the
// three move to a second line together, the leader running from its left
// edge to the figure — an index entry that runs over, not a figure jammed
// under a word.
export function IndexRow({ label, figure, onClick, className = "" }: Props) {
  const chevron = <Chevron className="w-4 h-4 mb-0.5 text-ink-faded" />;
  return (
    <button type="button" onClick={onClick} className={`${ROW} ${className}`}>
      {figure ? (
        <>
          <span className="min-w-0">{label}</span>
          <span className="flex-1 flex items-end gap-2">
            <span aria-hidden="true" className={ROW_LEADER} />
            {/* The spans run together in an accessible name; the comma keeps
                "Try capitals, 24 you can place" readable. */}
            <span className="sr-only">, </span>
            <span className={ROW_FIGURE}>{figure}</span>
            {chevron}
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">{label}</span>
          {chevron}
        </>
      )}
    </button>
  );
}
