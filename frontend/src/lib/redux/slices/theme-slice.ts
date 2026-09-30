import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ThemeMode } from "@/lib/theme";

interface ThemeState {
  mode: ThemeMode;
  /** False until the stored preference has been read on the client (SSR renders "system"). */
  hydrated: boolean;
}

const initialState: ThemeState = { mode: "system", hydrated: false };

export const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    themeHydrated(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      state.hydrated = true;
    },
    themeModeChanged(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
      state.hydrated = true;
    },
  },
});

export const { themeHydrated, themeModeChanged } = themeSlice.actions;
