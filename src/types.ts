export type Country = {
  numeric: string;
  iso3: string;
  name: string;
  aliases: string[];
};

export type Mode = "name-to-click" | "shape-to-name";

export type FeedbackKind = "correct" | "wrong" | "skipped";

export type Feedback = {
  kind: FeedbackKind;
  answerIso3: string;
  correctIso3: string;
};

export type Phase = "normal" | "review";

export type RetryEntry = { iso3: string; dueAt: number };
