import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PublicUser } from "@/lib/api/types";

/**
 * `checking`: the on-load silent refresh hasn't answered yet, so render neither "signed in" nor
 * "signed out" UI. Avoids a flash of "Sign in" for a signed-in visitor.
 */
export type SessionStatus = "checking" | "authenticated" | "anonymous";

interface SessionState {
  user: PublicUser | null;
  /** Kept in memory only, never in localStorage (XSS can't read it after a reload). */
  accessToken: string | null;
  status: SessionStatus;
}

const initialState: SessionState = { user: null, accessToken: null, status: "checking" };

export const sessionSlice = createSlice({
  name: "session",
  initialState,
  reducers: {
    sessionStarted(state, action: PayloadAction<{ user: PublicUser; accessToken: string }>) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.status = "authenticated";
    },
    accessTokenRenewed(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    userUpdated(state, action: PayloadAction<PublicUser>) {
      state.user = action.payload;
    },
    sessionEnded(state) {
      state.user = null;
      state.accessToken = null;
      state.status = "anonymous";
    },
  },
});

export const { sessionStarted, accessTokenRenewed, userUpdated, sessionEnded } = sessionSlice.actions;
