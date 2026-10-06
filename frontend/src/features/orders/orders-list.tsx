"use client";

import { ArrowLeft, Package } from "lucide-react";
import NextLink from "next/link";
import { ButtonLink, Card, EmptyState, Icon, Skeleton, useToast } from "@/components/ui";
import { useCancelOrderMutation, useMyOrdersQuery, useOrderQuery } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { formatMoney } from "@/lib/money";
import { AskAboutOrder } from "@/features/messaging/ask-links";
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
              {/* Phones: number + status, titles, then date + total. From `sm`: one row. */}
              <Card interactive className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 sm:flex sm:gap-x-6">
                <span className="font-medium whitespace-nowrap text-text sm:order-1">{order.orderNumber}</span>
                <span className="justify-self-end sm:order-5">
                  <OrderStatusBadge order={order} />
                </span>
                <span className="col-span-2 truncate text-sm text-text-muted sm:order-2 sm:col-span-1 sm:min-w-0 sm:flex-1">
                  {[...new Set(order.items.map((i) => i.title))].join(", ")}
                </span>
                <span className="text-sm whitespace-nowrap text-text-muted sm:order-3">{day.format(new Date(order.createdAt))}</span>
                <span className="justify-self-end font-medium whitespace-nowrap tabular-nums sm:order-4">
                  {formatMoney({ amount: order.total, currency: order.currency })}
                </span>
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
        <>
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
          <AskAboutOrder orderNumber={data.orderNumber} />
        </>
      )}
    </div>
  );
}
