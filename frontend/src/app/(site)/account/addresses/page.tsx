import type { Metadata } from "next";
import { AddressesManager } from "@/features/account/addresses-manager";

export const metadata: Metadata = { title: "Addresses" };

export default function AddressesPage() {
  return <AddressesManager />;
}
