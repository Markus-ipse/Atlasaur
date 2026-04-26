export type Continent =
  | "Africa"
  | "Antarctica"
  | "Asia"
  | "Europe"
  | "North America"
  | "Oceania"
  | "South America";

export const ALL_CONTINENTS: readonly Continent[] = [
  "Africa",
  "Antarctica",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
];

export type Country = {
  numeric: string;
  iso3: string;
  name: string;
  aliases: string[];
  continent: Continent;
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
