import type { Metadata } from "next";
import { OrdersAdmin } from "@/features/admin/orders-admin";

export const metadata: Metadata = { title: "Orders" };

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const { show } = await searchParams;
  return <OrdersAdmin toShip={show === "to_ship"} />;
}
