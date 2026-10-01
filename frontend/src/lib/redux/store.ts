import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { setupListeners } from "@reduxjs/toolkit/query";
import { api } from "@/lib/api/api";
import { sessionSlice } from "./slices/session-slice";
import { themeSlice } from "./slices/theme-slice";

const rootReducer = combineReducers({
  [themeSlice.name]: themeSlice.reducer,
  [sessionSlice.name]: sessionSlice.reducer,
  [api.reducerPath]: api.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;

/** One store per request on the server and one per tab on the client (Next.js App Router pattern). */
export function makeStore(preloadedState?: Partial<RootState>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefault) => getDefault().concat(api.middleware),
  });
  // Refetch on window focus / reconnect where endpoints opt in.
  setupListeners(store.dispatch);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
