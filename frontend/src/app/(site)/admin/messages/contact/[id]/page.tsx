import type { Metadata } from "next";
import { ContactRequestDetail } from "@/features/messaging/admin-inbox";

export const metadata: Metadata = { title: "Contact message" };

export default async function AdminContactPage({ params }: PageProps<"/admin/messages/contact/[id]">) {
  const { id } = await params;
  return <ContactRequestDetail id={id} />;
}
