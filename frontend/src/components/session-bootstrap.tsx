"use client";

import { useEffect, useRef } from "react";
import { useRestoreSessionMutation } from "@/lib/api/auth-api";
import { useAppDispatch } from "@/lib/redux/hooks";
import { sessionEnded } from "@/lib/redux/slices/session-slice";

/** Set by the API alongside the httpOnly refresh cookie; holds no secret (backend auth.controller.ts). */
const SESSION_HINT = /(?:^|;\s*)bs_session=1(?:;|$)/;

export function hasSessionHint(cookie: string = typeof document === "undefined" ? "" : document.cookie): boolean {
  return SESSION_HINT.test(cookie);
}

/**
 * Restores the session from the httpOnly refresh cookie once per page load, so a signed-in
 * visitor stays signed in across reloads and tabs. A visitor without the session hint is known to
 * be signed out immediately, with no request, so the header shows Sign in / Create account at
 * once instead of a placeholder while the API answers (BS-19).
 */
export function SessionBootstrap() {
  const [restore] = useRestoreSessionMutation();
  const dispatch = useAppDispatch();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (hasSessionHint()) void restore();
    else dispatch(sessionEnded());
  }, [restore, dispatch]);

  return null;
}
