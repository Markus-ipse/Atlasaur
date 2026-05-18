import type { PracticeMode } from "../types";

type Props = {
  mode: PracticeMode;
  onChange: (mode: PracticeMode) => void;
};

export function PracticeModeToggle({ mode, onChange }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Practice mode"
      className="flex gap-0.5 p-0.5 rounded-full border border-ink-faded/40 bg-parchment-shadow"
    >
      <SegButton active={mode === "exam"} onClick={() => onChange("exam")}>
        Exam
      </SegButton>
      <SegButton
        active={mode === "training"}
        onClick={() => onChange("training")}
      >
        Training
      </SegButton>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={
        "px-2.5 min-h-7 rounded-full text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-deep " +
        (active ? "bg-ink-deep text-parchment-base" : "text-ink-mid hover:bg-parchment-base")
      }
    >
      {children}
    </button>
  );
}
