"use client";

import { useEffect } from "react";
import { io } from "socket.io-client";
import { api } from "@/lib/api/api";
import { authApi } from "@/lib/api/auth-api";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { REALTIME_URL, tokenIsFresh } from "@/lib/realtime";

type ConversationEvent = { conversationId?: string };

// The staff dashboard counts unread messages and new sales (both arrive as these events); it only
// refetches while it is open.
const MESSAGING_TAGS = ["Conversations", "Inbox", "ContactRequests", "Notifications", "AdminDashboard"] as const;

/**
 * Live updates for the signed-in person (ARCHITECTURE §12). Events only say "this changed"; the
 * matching RTK Query data is refetched, so the screen always shows what the API has stored.
 *
 * - Connects with the in-memory access token; the server puts the socket in its rooms.
 * - The server drops the socket when that token expires. The bridge then renews the session (under
 *   the shared refresh lock) and connects again, which also rejoins the rooms.
 * - After any reconnect, every messaging query is refetched, so events missed while offline
 *   are never lost.
 */
export function RealtimeBridge() {
  const status = useAppSelector((state) => state.session.status);
  const userId = useAppSelector((state) => state.session.user?.id ?? null);
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let stopped = false;
    let connectedBefore = false;
    // Server drops in the last minute. A token the server keeps refusing must not loop forever:
    // after 3 drops the bridge gives up and the screens fall back to focus/interval refreshes.
    let drops: number[] = [];
    const socket = io(REALTIME_URL, {
      // Read on every (re)connect, so a renewed token is always the one sent.
      auth: (send) => send({ token: store.getState().session.accessToken }),
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 30_000,
    });
    const refresh = (tags: Parameters<typeof api.util.invalidateTags>[0]) => dispatch(api.util.invalidateTags(tags));
    const conversationTags = ({ conversationId }: ConversationEvent = {}) => [
      ...MESSAGING_TAGS,
      ...(conversationId ? [{ type: "Conversation" as const, id: conversationId }] : []),
    ];

    socket.on("connect", () => {
      if (connectedBefore) refresh([...MESSAGING_TAGS, "Conversation"]);
      connectedBefore = true;
    });
    socket.on("message:new", (event: ConversationEvent) => refresh(conversationTags(event)));
    socket.on("message:read", (event: ConversationEvent) => refresh(conversationTags(event)));
    socket.on("conversation:updated", (event: ConversationEvent) => refresh(conversationTags(event)));
    socket.on("notification:new", () => refresh(["Notifications", "AdminDashboard"]));
    socket.on("disconnect", (reason) => {
      // Only a server-side drop needs us; the client reconnects by itself after network blips.
      if (reason !== "io server disconnect" || stopped) return;
      const now = Date.now();
      drops = [...drops.filter((at) => now - at < 60_000), now];
      if (drops.length >= 3) return;
      void (async () => {
        if (!tokenIsFresh(store.getState().session.accessToken)) {
          await dispatch(authApi.endpoints.restoreSession.initiate());
        }
        // Signed out meanwhile: the effect cleanup has run (or will), so don't reconnect.
        if (!stopped && store.getState().session.status === "authenticated") socket.connect();
      })();
    });

    return () => {
      stopped = true;
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [status, userId, dispatch, store]);

  return null;
}
