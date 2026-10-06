import type { Metadata } from "next";
import { WishlistPage } from "@/features/engagement/wishlist";

export const metadata: Metadata = { title: "Wishlist" };

export default function AccountWishlistPage() {
  return <WishlistPage />;
}
