"use client";

import { skipToken } from "@reduxjs/toolkit/query";
import { useCartQuery } from "@/lib/api/commerce-api";
import { useCurrency } from "@/lib/client-currency";
import { useAppSelector } from "@/lib/redux/hooks";

/**
 * The cart in the visitor's currency. Waits until the session check has answered, so a signed-in
 * buyer never briefly loads (and shows) a guest cart. `CartSessionSync` refetches it when the user
 * changes, which is when the server merges a guest cart into the account.
 */
export function useCart() {
  const currency = useCurrency();
  const status = useAppSelector((state) => state.session.status);
  const ready = currency !== null && status !== "checking";
  const query = useCartQuery(ready ? currency : skipToken);
  return { ...query, currency };
}
