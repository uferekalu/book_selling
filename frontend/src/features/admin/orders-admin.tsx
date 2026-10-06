"use client";

import { Package, Search, Truck } from "lucide-react";
import { useDeferredValue, useState } from "react";
import NextLink from "next/link";
import { Badge, Card, EmptyState, FormField, Icon, Input, Select, Skeleton } from "@/components/ui";
import { OrderStatusBadge, ORDER_STATUS } from "@/features/orders/order-detail";
import { useAdminOrdersQuery } from "@/lib/api/commerce-api";
import { formatMoney } from "@/lib/money";
import { AdminQueryError } from "./admin-query-error";

/** The "Status" filter's extra option: print copies waiting to go out. */
const TO_SHIP = "__to_ship";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Orders for staff: search, filter by status, or just the print copies waiting to ship (oldest first). */
export function OrdersAdmin({ toShip: startToShip = false }: { toShip?: boolean }) {
  const [status, setStatus] = useState(startToShip ? TO_SHIP : "");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const toShip = status === TO_SHIP;
  const { data, error, isLoading, refetch } = useAdminOrdersQuery({
    ...(toShip ? { shipment: "to_ship" as const } : status ? { status } : {}),
    ...(q ? { q } : {}),
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <FormField label="Search orders" hideLabel className="flex-1">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, email or name"
            leading={<Icon icon={Search} size="sm" />}
          />
        </FormField>
        <FormField label="Status" className="sm:w-56">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "", label: "All statuses" },
              { value: TO_SHIP, label: "To ship (print)" },
              ...Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label })),
            ]}
          />
        </FormField>
      </div>
      {error ? (
        <AdminQueryError error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : !data?.length ? (
        toShip ? (
          <EmptyState icon={Truck} title="Nothing to ship" description="Paid orders with print copies appear here until they’re marked as shipped." />
        ) : (
          <EmptyState icon={Package} title="No orders yet" description="Orders appear here as soon as they are placed." />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((order) => (
            <li key={order.orderNumber}>
              <NextLink href={`/admin/orders/${order.orderNumber}`} className="block rounded-2xl">
              <Card interactive className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{order.orderNumber}</span>
                  <span className="truncate text-sm text-text-muted">
                    {order.customerName} · {order.email}
                  </span>
                  <span className="truncate text-xs text-text-subtle">
                    {order.items.map((i) => `${i.title} (${i.format === "ebook" ? "ebook" : `print × ${i.quantity}`})`).join(", ")}
                  </span>
                </div>
                <span className="text-sm text-text-muted">{when.format(new Date(order.createdAt))}</span>
                <span className="font-medium tabular-nums">{formatMoney({ amount: order.total, currency: order.currency })}</span>
                <OrderStatusBadge order={order} />
                {(order.shipment.status === "pending" || order.shipment.status === "processing") &&
                  (order.status === "paid" || order.status === "partially_refunded") && (
                    <Badge tone="info" size="sm">
                      {order.shipment.status === "pending" ? "To ship" : "Being prepared"}
                    </Badge>
                  )}
                {order.attention?.required && (
                  <Badge tone="warning" size="sm">
                    Needs attention
                  </Badge>
                )}
              </Card>
              </NextLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
