"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { themeHydrated } from "@/lib/redux/slices/theme-slice";
import { applyThemeToDom, persistThemeMode, readStoredThemeMode } from "@/lib/theme";

/**
 * Keeps Redux, the DOM `data-theme` attribute and localStorage in step. The inline bootstrap
 * script already applied the stored choice before paint; this reads it into Redux once, then
 * owns every later change.
 */
export function ThemeSync() {
  const dispatch = useAppDispatch();
  const { mode, hydrated } = useAppSelector((state) => state.theme);

  useEffect(() => {
    dispatch(themeHydrated(readStoredThemeMode()));
  }, [dispatch]);

  useEffect(() => {
    if (!hydrated) return;
    applyThemeToDom(mode);
    persistThemeMode(mode);
  }, [mode, hydrated]);

  return null;
}
