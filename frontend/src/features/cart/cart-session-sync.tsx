"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api/api";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

/** Signing in or out changes whose cart and orders these are: refetch them. */
export function CartSessionSync() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector((state) => state.session.user?.id ?? null);
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previous.current !== undefined && previous.current !== userId) {
      dispatch(api.util.invalidateTags(["Cart", "Orders"]));
    }
    previous.current = userId;
  }, [userId, dispatch]);
  return null;
}
