# Atlasaur

Live demo: <https://markus-ipse.github.io/Atlasaur/>

A small browser game for learning to identify countries on a world map. Two
modes:

- **Name → Click**: a country name is shown; click it on the map.
- **Shape → Name**: a country is highlighted; type its name.

Both modes track your progress through the country pool, support Skip, and
show an end-of-session summary listing the countries you missed. Pan the map
by dragging, zoom with the scroll wheel or pinch.

## Run it

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

### Scripts

| Command                     | What it does                                   |
| --------------------------- | ---------------------------------------------- |
| `npm run dev`               | Start the dev server with HMR.                 |
| `npm run build`             | Type-check the app and produce a production build in `dist/`. |
| `npm run preview`           | Serve the production build locally.            |
| `npm run lint`              | Run ESLint over `src/` and config files.       |
| `npm run typecheck`         | `tsc --noEmit` across the whole project.       |
| `npm test`                  | Run the Vitest suite once (jsdom env).         |
| `npm run build:topology`    | Regenerate `src/data/world-110m.json` from `world-atlas` (splits French Guiana out of France). |
| `npm run build:countries`   | Regenerate `src/data/countries.json` from the topology and the table in `scripts/build-countries.mjs` (runs `build:topology` first). |

## Adding or refining countries / aliases

Edit `scripts/build-countries.mjs`. The `COUNTRIES` object is keyed by
**ISO 3166-1 numeric code** (zero-padded to three digits — that's what
`world-atlas` uses). Each entry has:

```js
"250": { iso3: "FRA", name: "France", aliases: ["French Republic"] },
```

- `iso3` — ISO 3166-1 alpha-3, used as the canonical key in game state.
- `name` — the canonical display name shown to the player.
- `aliases` — strings the typed-answer mode will accept as correct in addition
  to `name`. They're matched after normalization (lowercased, diacritics
  stripped, apostrophes removed, whitespace collapsed), so you don't need to
  worry about case or accents here.

After editing, run `npm run build:countries` to regenerate
`src/data/countries.json`. The script also reports:

- **In COUNTRIES table but absent from topology** — the country won't appear on
  the map at the current resolution (`countries-110m`); usually the country is
  too small.
- **In topology but absent from COUNTRIES table** — the shape will render but
  be inert (un-clickable, never the answer).

## Project structure

```
.
├── scripts/
│   ├── build-countries.mjs       # Country data generator (run via npm script)
│   └── build-topology.mjs        # Derives src/data/world-110m.json from world-atlas
├── src/
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # Top-level layout, owns useGame()
│   ├── index.css                 # Tailwind v4 entry (@import "tailwindcss")
│   ├── types.ts                  # Country, Mode, Phase, Feedback, Subregion, tiers
│   ├── data/
│   │   ├── countries.json        # Generated: country metadata
│   │   ├── world-110m.json       # Generated: derived topology
│   │   └── normalize.ts          # String normalization for answer matching
│   ├── game/
│   │   ├── useGame.ts            # Game state machine (useReducer + hook)
│   │   └── pickCountry.ts        # Fresh-pool picker with retry-queue priority
│   └── components/
│       ├── WorldMap.tsx          # SVG world map with d3-geo + d3-zoom
│       ├── ControlZone.tsx       # Prompt, AnswerInput, Reveal, Skip/Continue
│       ├── StatusBar.tsx         # ScorePanel + SettingsMenu
│       ├── ScorePanel.tsx        # Done x/y, misses, streak
│       ├── SettingsMenu.tsx      # Mode, continents, reveal-labels, End session
│       ├── Prompt.tsx            # Country prompt (name or highlighted shape)
│       ├── AnswerInput.tsx       # Typed input for shape-to-name mode
│       ├── RevealHero.tsx        # Wrong/skipped reveal panel with capital + neighbors
│       ├── SessionSummary.tsx    # End-of-session modal
│       ├── fillFor.ts            # Country color decision (default/highlight/reveal)
│       ├── labelLayout.ts        # Country label placement on the map
│       └── revealZoom.ts         # Auto-frame the correct country on reveal
├── index.html
├── vite.config.ts                # Vite + @tailwindcss/vite + @vitejs/plugin-react
├── eslint.config.js              # Flat config, typescript-eslint
├── tsconfig.json + tsconfig.app.json + tsconfig.node.json
└── package.json
```

## Deployment

Pushes to `main` are built and published to GitHub Pages by
`.github/workflows/deploy.yml`. The workflow runs `npm ci && npm run build`
and uploads `dist/` via `actions/deploy-pages`.

One-time setup: in repo **Settings → Pages**, set **Source** to
**"GitHub Actions"**. The first run won't deploy until that's flipped.

`vite.config.ts` sets `base: "./"` so the built assets work under any
subpath (here, `/Atlasaur/`) without hardcoding the repo name.

The build is an installable web app: `vite-plugin-pwa` emits a manifest and
a service worker that precaches every asset, so once loaded it opens and
works offline, and "Add to Home Screen" gives it an icon and its own window.
There is no push and no background sync; a new deploy waits and takes over
on the next visit rather than interrupting a session.

## Stack

- Vite 6, React 19, TypeScript 5.7
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `d3-geo` + `d3-zoom` + `d3-selection` for the map
- `topojson-client` + `world-atlas` for country shapes (`countries-110m.json`)

No backend, no auth. Selected continents and the reveal-labels preference
persist in localStorage; in-session progress (Done count, streak, missed list)
resets on reload.
