import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { Provider } from "react-redux";
import { ToastProvider } from "@/components/ui/toast";
import { makeStore, type RootState } from "@/lib/redux/store";

/** Renders with the same providers the app root uses, plus a userEvent instance. */
export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, ...options }: { preloadedState?: Partial<RootState> } & Omit<RenderOptions, "wrapper"> = {},
) {
  const store = makeStore(preloadedState);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <Provider store={store}>
        <ToastProvider>{children}</ToastProvider>
      </Provider>
    );
  }
  return { store, user: userEvent.setup(), ...render(ui, { wrapper: Wrapper, ...options }) };
}
