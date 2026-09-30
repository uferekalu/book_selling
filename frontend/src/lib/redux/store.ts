import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { themeSlice } from "./slices/theme-slice";

// The RTK Query `api` reducer and middleware join here in BS-4 (docs/ARCHITECTURE.md §7).
const rootReducer = combineReducers({
  [themeSlice.name]: themeSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** One store per request on the server and one per tab on the client (Next.js App Router pattern). */
export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({ reducer: rootReducer, preloadedState });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
