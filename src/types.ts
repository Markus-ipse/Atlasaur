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

// UN M49 subregions, kept in sync with VALID_SUBREGIONS in
// scripts/build-countries.mjs. Antarctica is included for ATA / ATF, which
// don't have a formal M49 subregion.
export type Subregion =
  | "Northern Africa"
  | "Eastern Africa"
  | "Middle Africa"
  | "Southern Africa"
  | "Western Africa"
  | "Caribbean"
  | "Central America"
  | "South America"
  | "Northern America"
  | "Central Asia"
  | "Eastern Asia"
  | "South-eastern Asia"
  | "Southern Asia"
  | "Western Asia"
  | "Eastern Europe"
  | "Northern Europe"
  | "Southern Europe"
  | "Western Europe"
  | "Australia and New Zealand"
  | "Melanesia"
  | "Micronesia"
  | "Polynesia"
  | "Antarctica";

export type SizeTier = 0 | 1 | 2 | 3;
export type NotabilityTier = 0 | 1 | 2;

export type Country = {
  numeric: string;
  iso3: string;
  name: string;
  aliases: string[];
  continent: Continent;
  subregion: Subregion;
  // null for territories without a meaningful capital (e.g. Antarctica).
  // UI omits the "Capital:" line on null, mirroring how "Bordered by:" is
  // omitted when `neighbors` is empty.
  capital: string | null;
  // Additional capitals for countries with administrative splits (e.g.
  // South Africa, Bolivia, Sri Lanka). Absent when there's only one. The
  // reveal renders `Capitals: primary, ...alternates` when present;
  // see docs/plans/m2-capital-decisions.md for the per-row rationale.
  capitalAlternates?: string[];
  // iso3 codes; land borders only, derived from topology at build time with
  // hand overrides for overseas-territory artefacts (e.g. France/Brazil).
  neighbors: string[];
  sizeTier: SizeTier;
  notabilityTier: NotabilityTier;
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
