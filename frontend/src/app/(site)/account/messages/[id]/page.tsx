import type { Metadata } from "next";
import { ConversationView } from "@/features/messaging/conversation-view";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: PageProps<"/account/messages/[id]">) {
  const { id } = await params;
  return <ConversationView id={id} viewer="customer" />;
}
