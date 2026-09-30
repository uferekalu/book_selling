export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function readStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : "system";
  } catch {
    // Private mode / blocked storage: fall back to the OS preference.
    return "system";
  }
}

export function persistThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage unavailable: the choice still applies for this page view.
  }
}

/** Explicit modes force `data-theme`; `system` removes it so `prefers-color-scheme` decides. */
export function applyThemeToDom(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
}

/**
 * Runs inline in <head> before first paint so the page never flashes the wrong theme. Kept next
 * to the functions above so the two can't drift; must stay dependency-free.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_STORAGE_KEY}');if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();`;
