import type { MasteryTier } from "../game/srs";
import type { Feedback } from "../types";

// SVG fill/stroke attributes set from JS need literal color values — var()
// references don't interpolate across CSS transitions reliably. We resolve
// the @theme tokens from src/index.css to hex strings at theme-flip time
// via readPaletteFromCss(), then pass the palette down. The values reaching
// SVG attributes stay literal, but CSS remains the single source of truth.

export type Palette = {
  masteryUnseen: string; // in-scope land, never answered — ghost outline
  masterySeen: string; // in-scope land with a record, not yet known
  masteryKnown: string; // in-scope land the learner knows — full pigment
  inert: string; // out-of-scope / undefined country
  highlight: string; // the country a typed question is asking about
  correct: string; // the answer on a reveal — found, missed or skipped
  wrong: string; // wrong-clicked country fill
  neighbor: string; // miss-reveal land neighbors
  border: string; // country path stroke
  label: string; // country name text
  borderInverse: string; // country path stroke where `border` would vanish
  oceanTint: string; // SVG/map background
  oceanLabel: string; // ocean label text
  capitalDot: string; // miss-reveal capital marker fill
  capitalDotHalo: string; // miss-reveal capital marker halo
};

// CSS custom property names, keyed by Palette slot. Centralized so the
// mapping is auditable in one place.
const PALETTE_TOKENS: Record<keyof Palette, string> = {
  masteryUnseen: "--color-mastery-unseen",
  masterySeen: "--color-mastery-seen",
  masteryKnown: "--color-mastery-known",
  inert: "--color-parchment-shadow",
  highlight: "--color-prussian-blue",
  correct: "--color-sap-green",
  wrong: "--color-vermillion-faded",
  neighbor: "--color-teal-engraving", // see the token's comment in index.css
  border: "--color-map-border",
  label: "--color-map-label",
  borderInverse: "--color-map-border-inverse",
  oceanTint: "--color-ocean-tint",
  oceanLabel: "--color-ink-mid",
  capitalDot: "--color-ink-deep",
  capitalDotHalo: "--color-parchment-base",
};

// Resolves the current Palette by reading CSS custom properties off
// <html>. Call this AFTER the theme's data-theme attribute has been
// applied (the pre-paint script in index.html does this on first load;
// useTheme's layout effect does it on toggle). Safe to call at module
// init in a browser env — returns empty strings under SSR/jsdom without
// a populated stylesheet, which is fine for tests that pass their own
// palette fixture rather than calling this.
export function readPaletteFromCss(): Palette {
  const root = getComputedStyle(document.documentElement);
  const get = (name: string) => root.getPropertyValue(name).trim();
  const out = {} as Palette;
  for (const key of Object.keys(PALETTE_TOKENS) as (keyof Palette)[]) {
    out[key] = get(PALETTE_TOKENS[key]);
  }
  // Dev-mode loudness: a typo in PALETTE_TOKENS or a missing @theme entry
  // returns an empty string here and paints SVG fills as black/transparent
  // — exactly the silent divergence this refactor exists to prevent. Warn
  // so it shows up in the console during local work. Skipped under jsdom
  // (no parsed stylesheets → every token is empty by definition, would
  // spam ten warnings per <App /> mount in tests).
  if (import.meta.env.DEV && document.styleSheets.length > 0) {
    for (const key of Object.keys(out) as (keyof Palette)[]) {
      if (!out[key]) {
        console.warn(
          `[palette] empty value for ${key} (CSS token ${PALETTE_TOKENS[key]})`,
        );
      }
    }
  }
  return out;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

// Ambient mastery paint, indexed by MasteryTier.
const MASTERY_SLOT = [
  "masteryUnseen",
  "masterySeen",
  "masteryKnown",
] as const satisfies readonly (keyof Palette)[];

export type PaintArgs = {
  iso3: string | undefined;
  highlightedIso3: string | null;
  feedback: Feedback | null;
  inScope: boolean;
  neighborSet: ReadonlySet<string>;
  spotlightSet?: ReadonlySet<string>;
  // How much of this country the learner has taken (R2.1). Defaults to 0
  // (unseen) so callers that predate the ambient paint still type-check.
  masteryTier?: MasteryTier;
};

// The country a wrong answer named, when it named one other than the
// answer: a typed answer that matched nothing has an empty `answerIso3`.
export function wrongPickOf(feedback: Feedback | null): string | null {
  if (
    feedback?.kind === "wrong" &&
    feedback.answerIso3 &&
    feedback.answerIso3 !== feedback.correctIso3
  ) {
    return feedback.answerIso3;
  }
  return null;
}

export type Outline = { iso3: string; kind: "target" | "wrong" };

// The countries outlined as well as coloured (#62), so neither the typed
// question's target nor a wrong pick rests on colour alone: the target while
// its question is up (solid), and a wrong pick through its reveal (dashed).
// Decided here, beside the fills they accompany, so the two cannot disagree.
export function outlinesFor(
  feedback: Feedback | null,
  highlightedIso3: string | null,
): Outline[] {
  const out: Outline[] = [];
  if (!feedback && highlightedIso3) {
    out.push({ iso3: highlightedIso3, kind: "target" });
  }
  const wrong = wrongPickOf(feedback);
  if (wrong) out.push({ iso3: wrong, kind: "wrong" });
  return out;
}

// The fill alone. The map draws through `paintFor`, which adds the line;
// this stays for callers that need only the colour, such as the tests of the
// precedence chain.
export function fillFor(args: PaintArgs, palette: Palette): string {
  return resolveFill(args, palette).fill;
}

// A country's fill and the line that draws it, together, because a focus
// sets both back: fading the fill alone does next to nothing to unseen land,
// which already sits a hair above the ocean, so the rest of the map recedes
// mostly by losing its lines while the focus keeps them (#62). Everything
// that draws a country — a path or a marker dot — takes its paint from here.
export function paintFor(
  args: PaintArgs,
  palette: Palette,
): { fill: string; stroke: string } {
  const { fill, receded } = resolveFill(args, palette);
  const stroke = strokeFor(fill, palette);
  return {
    fill,
    stroke: receded ? recede(stroke, palette, RECEDE_LINE) : stroke,
  };
}

function resolveFill(
  args: PaintArgs,
  palette: Palette,
): { fill: string; receded: boolean } {
  const fill = (f: string) => ({ fill: f, receded: false });
  const { iso3, highlightedIso3, feedback, inScope, neighborSet } = args;
  const spotlightSet = args.spotlightSet ?? EMPTY_SET;
  if (!iso3) return fill(palette.inert);
  if (feedback) {
    // The answer always lights up green — found, missed or skipped. Green
    // means "this is the one" on the map and nothing else (#62); the panel
    // says how the learner got there.
    if (feedback.correctIso3 === iso3) return fill(palette.correct);
    if (wrongPickOf(feedback) === iso3) return fill(palette.wrong);
    // Elaborative-encoding cue: paint land neighbors of the correct country.
    // Wrong-clicked country is handled above so it stays vermillion if it
    // happens to also be a neighbor.
    if (neighborSet.has(iso3)) return fill(palette.neighbor);
  }
  if (highlightedIso3 === iso3) return fill(palette.highlight);
  if (!inScope) return fill(palette.inert);
  // Ambient mastery paint — the bottom of the chain. Everything above is a
  // reveal or the question's target; progress is what shows when neither
  // applies.
  const mastery = palette[MASTERY_SLOT[args.masteryTier ?? 0]];
  // A focus (#62) keeps its own countries' paint and sets the rest of the
  // scope back into the ocean, so the region reads by what surrounds it
  // rather than by a wash of its own that would compete with the progress
  // inside it. Out-of-scope land is already inert and stays so. Like the
  // mastery paint, this holds under a miss-reveal for every country the
  // reveal does not name.
  if (spotlightSet.size > 0 && !spotlightSet.has(iso3)) {
    return { fill: recede(mastery, palette, RECEDE_FILL), receded: true };
  }
  return fill(mastery);
}

// How far a focus sets the rest of the map back into the ocean. The fill
// goes far enough that known land outside a focus is no brighter than unseen
// land inside it in dark (at half, Egypt outshone every country in a Western
// Asia focus); the line goes half as far, so the land keeps a faint edge.
export const RECEDE_FILL = 0.75;
const RECEDE_LINE = 0.5;

// `color` mixed `amount` of the way into the ocean — a receded fill, or the
// line round one — as a literal hex so a fill transition and strokeFor's
// contrast check both see the colour actually drawn. An unparseable colour
// (a test fixture's sentinel, or a token jsdom resolved empty) comes back
// unchanged rather than guessed at.
const RECEDE_CACHE = new Map<string, string>();

export function recede(
  color: string,
  palette: Palette,
  amount: number,
): string {
  const key = `${color}|${palette.oceanTint}|${amount}`;
  const hit = RECEDE_CACHE.get(key);
  if (hit !== undefined) return hit;
  const a = parseColor(color);
  const b = parseColor(palette.oceanTint);
  const out =
    a && b
      ? "#" +
        a
          .map((v, i) =>
            Math.round(v + (b[i] - v) * amount)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("")
      : color;
  RECEDE_CACHE.set(key, out);
  return out;
}

// --- The engraved line -----------------------------------------------------
//
// One border ink can't hold against a fill ramp that spans the whole
// luminance range. In dark mode --color-map-border is a warm faded ochre so
// coastlines read against the near-black ocean — which means it all but
// disappears into the bright pigments above it in fillFor's chain: known
// land, the typed question's target, a reveal's green/red/neighbour tones.
// Two gold countries side by side then look like one landmass, which is
// exactly the shape a learner is being asked to find.
//
// So the line has a second ink. `strokeFor` keeps --color-map-border unless
// it is failing against the fill it sits on, and only then reaches for
// --color-map-border-inverse (dark near-black under dark, pale under light).
// The floor keeps it from flipping on marginal gains: in light mode nothing
// reaches it, so the map there is untouched.
//
// Where two countries meet only one of the two strokes wins by paint order.
// That's fine — each is chosen against its own fill, so the shared edge
// always reads against at least one side of it.

export const BORDER_MIN_CONTRAST = 2.5;

// Relative luminance per WCAG 2.x. Returns null for anything we can't parse
// — a palette fixture with sentinel values, or a token that resolved empty
// under jsdom — so the caller falls back to the default ink rather than
// guessing.
function relativeLuminance(color: string): number | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// #rgb, #rrggbb and rgb()/rgba() — the forms getPropertyValue can hand back
// for a color token across browsers.
function parseColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const h = hex[1];
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const fn = /^rgba?\(([^)]+)\)$/i.exec(color.trim());
  if (fn) {
    const parts = fn[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .slice(0, 3);
    if (parts.length !== 3) return null;
    const nums = parts.map((p) =>
      p.endsWith("%") ? (parseFloat(p) / 100) * 255 : parseFloat(p),
    );
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums as [number, number, number];
  }
  return null;
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Runs for every path on every render, over a handful of distinct fills.
// Keyed on the ink pair too, so a theme flip can't serve a stale answer.
const STROKE_CACHE = new Map<string, string>();

export function strokeFor(fill: string, palette: Palette): string {
  const key = `${fill}|${palette.border}|${palette.borderInverse}`;
  const hit = STROKE_CACHE.get(key);
  if (hit !== undefined) return hit;
  const stroke = chooseStroke(fill, palette);
  STROKE_CACHE.set(key, stroke);
  return stroke;
}

function chooseStroke(fill: string, palette: Palette): string {
  const onBorder = contrastRatio(fill, palette.border);
  if (onBorder === null || onBorder >= BORDER_MIN_CONTRAST) {
    return palette.border;
  }
  const onInverse = contrastRatio(fill, palette.borderInverse);
  if (onInverse === null || onInverse <= onBorder) return palette.border;
  return palette.borderInverse;
}
