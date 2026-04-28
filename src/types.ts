export const ALL_CONTINENTS = [
  "Africa",
  "Antarctica",
  "Asia",
  "Europe",
  "North America",
  "Oceania",
  "South America",
] as const;

export type Continent = (typeof ALL_CONTINENTS)[number];

export type Country = {
  numeric: string;
  iso3: string;
  name: string;
  aliases: string[];
  continent: Continent;
  // Set only for partially-recognized territories whose topology features
  // lack an ISO id; matched by world-atlas `properties.name` instead.
  topoName?: string;
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
