"use client";

import { CheckCircle2, Circle, ExternalLink, FileText, Package, Truck } from "lucide-react";
import { Button, Card, Icon, TextLink, useToast } from "@/components/ui";
import type { OrderView } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { saveObjectUrl, useGuestInvoiceMutation, useInvoiceMutation } from "@/lib/api/files-api";
import { cn } from "@/lib/cn";
import { guestOrderKey } from "@/features/checkout/checkout-key";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** Paid in some form: an invoice exists. */
export const hasInvoice = (order: Pick<OrderView, "status" | "paidAt">) =>
  Boolean(order.paidAt) && ["paid", "fulfilled", "partially_refunded", "refunded"].includes(order.status);

/** Downloads the PDF invoice; a guest proves the order with the key kept on this device. */
export function InvoiceButton({ order, guest }: { order: Pick<OrderView, "orderNumber">; guest: boolean }) {
  const [mine, mineState] = useInvoiceMutation();
  const [guestInvoice, guestState] = useGuestInvoiceMutation();
  const { toast } = useToast();
  const download = async () => {
    try {
      let url: string;
      if (guest) {
        const checkoutKey = guestOrderKey(order.orderNumber);
        if (!checkoutKey) {
          toast({ title: "Please open this order on the device you placed it on, or sign in.", tone: "danger" });
          return;
        }
        url = await guestInvoice({ orderNumber: order.orderNumber, checkoutKey }).unwrap();
      } else {
        url = await mine(order.orderNumber).unwrap();
      }
      saveObjectUrl(url, `invoice-${order.orderNumber}.pdf`);
    } catch (error) {
      toast({ title: "The invoice couldn’t be downloaded", description: errorMessage(error), tone: "danger" });
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      leadingIcon={<Icon icon={FileText} size="sm" />}
      isLoading={mineState.isLoading || guestState.isLoading}
      loadingLabel="Preparing the invoice"
      onClick={() => void download()}
    >
      Download invoice (PDF)
    </Button>
  );
}

const STEPS = [
  { key: "processing", label: "Being prepared", icon: Package },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
] as const;

const REACHED: Record<OrderView["shipment"]["status"], number> = {
  not_required: -1,
  pending: -1,
  processing: 0,
  shipped: 1,
  delivered: 2,
};

/** Where the print copy is (PRODUCT_RULES §8: Processing → Shipped with tracking → Delivered). */
export function ShipmentProgress({ order }: { order: OrderView }) {
  const { shipment } = order;
  if (shipment.status === "not_required" || !hasInvoice(order)) return null;
  const reached = REACHED[shipment.status];
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-xl font-medium">Your print copy</h2>
      <ol className="grid grid-cols-3 gap-2" aria-label="Delivery progress">
        {STEPS.map((step, index) => {
          const done = index <= reached;
          return (
            <li key={step.key} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-full border",
                  done ? "border-primary bg-primary text-on-primary" : "border-border bg-surface text-text-subtle",
                )}
              >
                <Icon icon={done ? step.icon : Circle} size="sm" />
              </span>
              <span className={cn("text-xs sm:text-sm", done ? "font-medium text-text" : "text-text-muted")}>{step.label}</span>
              {done && <span className="sr-only">(done)</span>}
            </li>
          );
        })}
      </ol>
      {shipment.status === "pending" && <p className="text-sm text-text-muted">We’ll email you as soon as it ships, with tracking.</p>}
      {(shipment.status === "shipped" || shipment.status === "delivered") && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {shipment.carrier && (
            <>
              <dt className="text-text-muted">Carrier</dt>
              <dd>{shipment.carrier}</dd>
            </>
          )}
          {shipment.trackingNumber && (
            <>
              <dt className="text-text-muted">Tracking number</dt>
              <dd className="font-mono">{shipment.trackingNumber}</dd>
            </>
          )}
          {shipment.shippedAt && (
            <>
              <dt className="text-text-muted">Shipped</dt>
              <dd>{day.format(new Date(shipment.shippedAt))}</dd>
            </>
          )}
          {shipment.deliveredAt && (
            <>
              <dt className="text-text-muted">Delivered</dt>
              <dd>{day.format(new Date(shipment.deliveredAt))}</dd>
            </>
          )}
        </dl>
      )}
      {shipment.trackingUrl && shipment.status === "shipped" && (
        <TextLink href={shipment.trackingUrl} external className="inline-flex items-center gap-1 self-start text-sm font-medium">
          Track your parcel <Icon icon={ExternalLink} size="xs" />
        </TextLink>
      )}
    </Card>
  );
}
