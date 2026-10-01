"use client";

import { useEffect, useRef } from "react";
import { useRestoreSessionMutation } from "@/lib/api/auth-api";

/**
 * Restores the session from the httpOnly refresh cookie once per page load, so a signed-in
 * visitor stays signed in across reloads and tabs. Pages with no authenticated queries (the home
 * page) would otherwise never discover the session.
 */
export function SessionBootstrap() {
  const [restore] = useRestoreSessionMutation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void restore();
  }, [restore]);

  return null;
}
