"use client";

import { ArrowLeft, Package } from "lucide-react";
import NextLink from "next/link";
import { ButtonLink, Card, EmptyState, Icon, Skeleton, useToast } from "@/components/ui";
import { useCancelOrderMutation, useMyOrdersQuery, useOrderQuery } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { OrderDetail, OrderStatusBadge } from "./order-detail";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function OrdersList() {
  const { data, isLoading, error } = useMyOrdersQuery();
  if (isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error) return <p className="text-danger">{errorMessage(error)}</p>;
  if (!data?.length) {
    return (
      <EmptyState
        icon={Package}
        title="No orders yet"
        description="When you buy a book, the order appears here."
        action={<ButtonLink href="/books">Browse the books</ButtonLink>}
      />
    );
  }
  return (
    <section className="flex flex-col gap-4" aria-labelledby="orders-title">
      <h2 id="orders-title" className="text-2xl font-medium">
        Orders
      </h2>
      <ul className="flex flex-col gap-3">
        {data.map((order) => (
          <li key={order.orderNumber}>
            <NextLink href={`/account/orders/${order.orderNumber}`} className="block rounded-2xl">
              <Card interactive className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-text">{order.orderNumber}</span>
                  <span className="truncate text-sm text-text-muted">{order.items.map((i) => i.title).join(", ")}</span>
                </div>
                <span className="text-sm text-text-muted">{day.format(new Date(order.createdAt))}</span>
                <span className="font-medium tabular-nums">{formatMoney({ amount: order.total, currency: order.currency })}</span>
                <OrderStatusBadge order={order} />
              </Card>
            </NextLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AccountOrder({ orderNumber }: { orderNumber: string }) {
  const { data, isLoading, error } = useOrderQuery(orderNumber);
  const [cancel, cancelState] = useCancelOrderMutation();
  const { toast } = useToast();
  return (
    <div className="flex flex-col gap-4">
      <NextLink
        href="/account/orders"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-text-muted hover:text-text"
      >
        <Icon icon={ArrowLeft} size="sm" /> All orders
      </NextLink>
      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : error || !data ? (
        <p className="text-danger">{errorMessage(error, "This order could not be found.")}</p>
      ) : (
        <OrderDetail
          order={data}
          cancelling={cancelState.isLoading}
          onCancel={() =>
            void cancel(orderNumber)
              .unwrap()
              .then(() => toast({ title: "Order cancelled", tone: "success" }))
              .catch((e: unknown) => toast({ title: errorMessage(e), tone: "danger" }))
          }
        />
      )}
    </div>
  );
}
