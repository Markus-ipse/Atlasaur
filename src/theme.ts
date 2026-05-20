import { useEffect, useLayoutEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const STORAGE_KEY = "atlasaur:theme";

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): Theme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

// Storage contract for the theme pref is duplicated in index.html's
// pre-paint <script> (must run before any module code to avoid FOUC, so
// it can't import from here). If you change the key, the accepted values,
// or the fallback behavior, update BOTH sites in lockstep — divergence
// produces a flash of the wrong theme on first paint.
function loadPref(): ThemePref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // localStorage may be unavailable (private mode, SSR)
  }
  return "system";
}

function savePref(pref: ThemePref): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignore
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function useTheme(): {
  pref: ThemePref;
  theme: Theme;
  setPref: (pref: ThemePref) => void;
} {
  const [pref, setPrefState] = useState<ThemePref>(loadPref);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  // Keep the system-preference state live so a `pref === "system"` user sees
  // OS-level light/dark flips propagate without a reload.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const theme = resolveTheme(pref, systemDark);

  // Mirror the resolved theme onto <html data-theme="..."> so the @theme
  // token override block in index.css applies, and update the meta
  // theme-color so the mobile chrome bar matches. The pre-paint script in
  // index.html runs first to avoid FOUC; this layout effect keeps both in
  // sync when the user changes pref or the system flips while on "system".
  // Layout effect (not regular effect) so the data-theme attribute is in
  // place before App's palette-reading layout effect runs.
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      // Light keeps the dark-ink "accent stripe" at the top of mobile
      // chrome (--color-ink-deep); dark matches the page surface for
      // seamless chrome (--color-parchment-base). Read from CSS so the
      // @theme block stays the single source of truth.
      const root = getComputedStyle(document.documentElement);
      const token =
        theme === "dark" ? "--color-parchment-base" : "--color-ink-deep";
      meta.setAttribute("content", root.getPropertyValue(token).trim());
    }
  }, [theme]);

  const setPref = (next: ThemePref) => {
    savePref(next);
    setPrefState(next);
  };

  return { pref, theme, setPref };
}
