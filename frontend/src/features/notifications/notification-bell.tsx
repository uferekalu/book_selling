"use client";

import { Bell, BellOff, CheckCheck, MessageSquare, Package, ReceiptText, ShoppingBag, Truck, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Drawer, EmptyState, Icon, IconButton, Skeleton } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import {
  LIVE,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
  useNotificationsQuery,
  type NotificationView,
} from "@/lib/api/messaging-api";
import { cn } from "@/lib/cn";
import { useAppSelector } from "@/lib/redux/hooks";
import { timeAgo } from "@/lib/time";

const ICONS: Record<NotificationView["type"], LucideIcon> = {
  message: MessageSquare,
  contact: MessageSquare,
  order_paid: ReceiptText,
  order_shipped: Truck,
  order_delivered: Package,
  refund: ReceiptText,
  new_sale: ShoppingBag,
};

/** Only paths inside the site are followed; anything else is ignored. */
const isInternalPath = (link: string) => link.startsWith("/") && !link.startsWith("//");

/**
 * The header bell (ARCHITECTURE §12) for signed-in people: an unread count, and a panel with the
 * latest 20 notifications. Live via the socket, plus a refresh every minute while the tab is in
 * front (entries written inside a payment transaction aren't pushed) and on focus.
 */
export function NotificationBell() {
  const status = useAppSelector((state) => state.session.status);
  const [open, setOpen] = useState(false);
  const signedIn = status === "authenticated";
  const { data, isLoading, error } = useNotificationsQuery(undefined, {
    skip: !signedIn,
    pollingInterval: 60_000,
    skipPollingIfUnfocused: true,
    ...LIVE,
  });
  const [markRead] = useMarkNotificationReadMutation();
  const [markAll, markAllState] = useMarkAllNotificationsReadMutation();
  const router = useRouter();

  if (!signedIn) return null;
  const unread = data?.unreadCount ?? 0;

  const openItem = (item: NotificationView) => {
    if (!item.read) void markRead(item.id);
    setOpen(false);
    if (isInternalPath(item.link)) router.push(item.link);
  };

  return (
    <>
      <IconButton
        label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        icon={<Icon icon={Bell} size="md" />}
        badge={unread || undefined}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      />
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        title="Notifications"
        footer={
          unread > 0 ? (
            <Button
              variant="outline"
              fullWidth
              isLoading={markAllState.isLoading}
              leadingIcon={<Icon icon={CheckCheck} size="sm" />}
              onClick={() => void markAll()}
            >
              Mark all as read
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <p className="text-danger">{errorMessage(error)}</p>
        ) : !data?.items.length ? (
          <EmptyState icon={BellOff} title="Nothing new" description="Replies to your messages and updates on your orders appear here." />
        ) : (
          <ul className="-mx-2 flex flex-col gap-1">
            {data.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-2 py-3 text-left transition-colors hover:bg-secondary focus-visible:bg-secondary",
                    !item.read && "bg-primary-subtle/50",
                  )}
                >
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-text-muted">
                    <Icon icon={ICONS[item.type]} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className={cn("text-sm wrap-anywhere text-text", !item.read && "font-semibold")}>{item.title}</span>
                    {item.body && <span className="line-clamp-2 text-sm wrap-anywhere text-text-muted">{item.body}</span>}
                    <span className="text-xs text-text-subtle">{timeAgo(item.createdAt)}</span>
                  </span>
                  {!item.read && (
                    <span className="mt-2 size-2 shrink-0 rounded-full bg-accent">
                      <span className="sr-only">Unread</span>
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>
    </>
  );
}
