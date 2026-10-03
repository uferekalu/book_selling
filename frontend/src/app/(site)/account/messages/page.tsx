import type { Metadata } from "next";
import { ConversationList } from "@/features/messaging/customer-messages";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return <ConversationList />;
}
