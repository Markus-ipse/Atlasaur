# Atlasaur

Live demo: <https://markus-ipse.github.io/Atlasaur/>

A small browser game for learning to identify countries on a world map. Two
modes:

- **Name → Click**: a country name is shown; click it on the map.
- **Shape → Name**: a country is highlighted; type its name.

Both modes track score and streak, support Skip, and show an end-of-session
summary listing the countries you missed. Pan the map by dragging, zoom with
the scroll wheel or pinch.

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
| `npm run build:countries`   | Regenerate `src/data/countries.json` from the world-atlas topology and the table in `scripts/build-countries.mjs`. |

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
├── scripts/build-countries.mjs   # Country data generator (run via npm script)
├── src/
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # Top-level layout, owns useGame()
│   ├── index.css                 # Tailwind v4 entry (@import "tailwindcss")
│   ├── types.ts                  # Country, Mode, Feedback
│   ├── data/
│   │   ├── countries.json        # Generated: 174 entries
│   │   └── normalize.ts          # String normalization for answer matching
│   ├── game/
│   │   ├── useGame.ts            # Game state machine (useReducer)
│   │   └── pickCountry.ts        # Random pick excluding the previous country
│   └── components/
│       ├── WorldMap.tsx          # SVG world map with d3-geo + d3-zoom
│       ├── PromptBar.tsx         # Mode toggle, prompt text, skip/end buttons
│       ├── AnswerInput.tsx       # Mode 2 typed input
│       ├── ScorePanel.tsx        # Score, streak, round counter
│       └── SessionSummary.tsx    # End-of-session modal
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

## Stack

- Vite 6, React 19, TypeScript 5.7
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `d3-geo` + `d3-zoom` + `d3-selection` for the map
- `topojson-client` + `world-atlas` for country shapes (`countries-110m.json`)

No backend, no auth, no persistence — score and streak reset on reload.
