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
      className="flex gap-0.5 p-0.5 rounded-full border border-slate-200 bg-slate-50"
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
        "px-2.5 min-h-7 rounded-full text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 " +
        (active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")
      }
    >
      {children}
    </button>
  );
}
