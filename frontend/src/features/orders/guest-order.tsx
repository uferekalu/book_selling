"use client";

import { SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { ButtonLink, Container, EmptyState, Skeleton, useToast } from "@/components/ui";
import { guestOrderKey } from "@/features/checkout/checkout-key";
import { useGuestCancelOrderMutation, useGuestOrderMutation, type OrderView } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { OrderDetail } from "./order-detail";

/** A guest's order, opened on the device that placed it (the key never leaves this browser). */
export function GuestOrder({ orderNumber }: { orderNumber: string }) {
  const [lookup] = useGuestOrderMutation();
  const [cancel, cancelState] = useGuestCancelOrderMutation();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [missing, setMissing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const key = guestOrderKey(orderNumber);
    if (!key) {
      // Reading browser storage is the external system here; nothing to fetch without a key.
      queueMicrotask(() => setMissing(true));
      return;
    }
    lookup({ orderNumber, checkoutKey: key })
      .unwrap()
      .then(setOrder)
      .catch(() => setMissing(true));
  }, [orderNumber, lookup]);

  return (
    <Container width="narrow" className="py-8 sm:py-12">
      {missing ? (
        <EmptyState
          icon={SearchX}
          title="We can’t show this order here"
          description="Orders placed without an account open on the device used to place them, and from the link in your confirmation email."
          action={<ButtonLink href="/books">Browse the books</ButtonLink>}
        />
      ) : !order ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <OrderDetail
          order={order}
          guest
          cancelling={cancelState.isLoading}
          onCancel={() => {
            const key = guestOrderKey(orderNumber);
            if (!key) return;
            void cancel({ orderNumber, checkoutKey: key })
              .unwrap()
              .then((next) => {
                setOrder(next);
                toast({ title: "Order cancelled", tone: "success" });
              })
              .catch((error: unknown) => toast({ title: errorMessage(error), tone: "danger" }));
          }}
        />
      )}
    </Container>
  );
}
