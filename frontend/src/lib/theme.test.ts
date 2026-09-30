import { afterEach, describe, expect, it } from "vitest";
import {
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  applyThemeToDom,
  isThemeMode,
  readStoredThemeMode,
} from "./theme";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

describe("theme", () => {
  it("recognises only the three modes", () => {
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("sepia")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it("defaults to system when nothing (or garbage) is stored", () => {
    expect(readStoredThemeMode()).toBe("system");
    localStorage.setItem(THEME_STORAGE_KEY, "neon");
    expect(readStoredThemeMode()).toBe("system");
  });

  it("forces data-theme for explicit modes and clears it for system", () => {
    applyThemeToDom("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyThemeToDom("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("bootstrap script applies a stored explicit choice", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(THEME_BOOTSTRAP_SCRIPT)();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
