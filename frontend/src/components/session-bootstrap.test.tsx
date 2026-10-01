import { render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeStore } from "@/lib/redux/store";
import { SessionBootstrap, hasSessionHint } from "./session-bootstrap";

const NativeRequest = globalThis.Request;
class RelativeRequest extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === "string" ? new URL(input, "http://localhost").href : input, init);
  }
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal("Request", RelativeRequest);
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: "anonymous" }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "bs_session=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("hasSessionHint", () => {
  it("finds the flag among other cookies", () => {
    expect(hasSessionHint("theme=dark; bs_session=1; other=x")).toBe(true);
    expect(hasSessionHint("bs_session=1")).toBe(true);
  });

  it("ignores lookalikes and absence", () => {
    expect(hasSessionHint("")).toBe(false);
    expect(hasSessionHint("xbs_session=1")).toBe(false);
    expect(hasSessionHint("bs_session=10")).toBe(false);
  });
});

describe("SessionBootstrap", () => {
  it("marks a visitor without the hint as signed out at once, with no request", () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <SessionBootstrap />
      </Provider>,
    );
    expect(store.getState().session.status).toBe("anonymous");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restores the session when the hint is present", async () => {
    document.cookie = "bs_session=1; path=/";
    const store = makeStore();
    render(
      <Provider store={store}>
        <SessionBootstrap />
      </Provider>,
    );
    expect(store.getState().session.status).toBe("checking");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(store.getState().session.status).toBe("anonymous"));
  });
});
