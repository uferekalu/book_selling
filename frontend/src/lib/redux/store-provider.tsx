"use client";

import { useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { makeStore } from "./store";

export function StoreProvider({ children }: { children: ReactNode }) {
  // Lazy useState initialiser: exactly one store per mounted tree, never recreated on re-render.
  const [store] = useState(makeStore);
  return <Provider store={store}>{children}</Provider>;
}
