// What the two figures that are not self-explanatory mean, shared by the
// Study rest card and the settings' Data rows so the definitions cannot
// drift. Known is learnedCount, which includes FSRS Relearning: a known
// country missed again comes back within minutes, so the copy may not
// promise a days-long gap. Coming back is dueCount. Neither says a zero is
// good news: nothing coming back is not an achievement.
export const KNOWN_TIP =
  "Right often enough that it's now spaced out over days. Miss it and it comes back sooner.";
export const COMING_BACK_TIP = "Met before and ready for another look now.";
// No promise about what Keep going asks first: an in-session miss or the
// card Done left unanswered can come before these, and the line above Keep
// going already says what comes next.

// The small "?" mark beside a label that explains itself, drawn by CSS so
// it is not part of the label's text.
export const EXPLAINED_LABEL_CLASS =
  "underline decoration-dotted decoration-ink-faded underline-offset-2 after:content-['?'] after:inline-flex after:items-center after:justify-center after:w-3.5 after:h-3.5 after:ml-1 after:rounded-full after:border after:border-current after:text-[10px] after:leading-none after:no-underline after:align-[1px]";
