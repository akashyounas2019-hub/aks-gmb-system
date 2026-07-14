// Client-side theme controller — applies `.light` / no-class to <html>
// (the app is dark-first, so dark = the default root), persists the choice
// to localStorage, and reacts to OS changes when the user picks "system".

export type Theme = "system" | "light" | "dark";

export const THEME_KEY = "app:theme";

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") return prefersDark() ? "dark" : "light";
  return t;
}

export function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(t);
  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

export function setStoredTheme(t: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* ignore quota / private mode */
  }
}

// Keep the app in sync with OS preference while the user has "system" selected.
let mql: MediaQueryList | null = null;
let mqlHandler: ((e: MediaQueryListEvent) => void) | null = null;

export function watchSystemTheme(active: boolean): void {
  if (typeof window === "undefined") return;
  if (!mql) mql = window.matchMedia("(prefers-color-scheme: dark)");
  if (mqlHandler) mql.removeEventListener("change", mqlHandler);
  mqlHandler = null;
  if (active) {
    mqlHandler = () => applyTheme("system");
    mql.addEventListener("change", mqlHandler);
  }
}
