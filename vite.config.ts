import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    // Installable, offline after first load. The service worker precaches the
    // built assets (hashed JS/CSS, fonts, icons, index.html) and serves them
    // cache-first; there is no runtime caching of anything else because the
    // app makes no network requests after load. "prompt" here means the new
    // service worker waits rather than claiming open tabs: a new build takes
    // over on the next visit (all tabs closed), never by reloading a learner
    // mid-card. We deliberately show no update prompt — main.tsx ignores
    // onNeedRefresh.
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Atlasaur",
        short_name: "Atlasaur",
        description: "A world map you learn by heart.",
        // Mirrors --color-parchment-base / --color-ink-deep in src/index.css.
        // A manifest cannot read CSS variables, so these two literals are the
        // same contract as the theme-color pre-paint script in index.html.
        background_color: "#f0e2c4",
        theme_color: "#2b1f12",
        display: "standalone",
        orientation: "any",
        // Relative so the GitHub Pages subpath (/Atlasaur/) works, like base.
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The topology JSON is bundled into the JS; fonts are ~400 KB total.
        // txt covers fonts/OFL.txt so the licence URL stays reachable offline
        // instead of falling through to index.html.
        globPatterns: ["**/*.{js,css,html,woff2,png,svg,ico,txt}"],
        // Serve index.html for any in-scope navigation while offline.
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
