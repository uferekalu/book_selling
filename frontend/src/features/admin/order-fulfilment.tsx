"use client";

import { CheckCircle2, FileText, Package, PencilLine, Truck } from "lucide-react";
import { useId, useState } from "react";
import { z } from "zod";
import { Badge, Button, Card, FormField, Icon, Input, Modal, useToast } from "@/components/ui";
import { useUpdateShipmentMutation, type AdminOrderView, type EbookUsage, type ShipmentStep } from "@/lib/api/commerce-api";
import { errorMessage } from "@/lib/api/errors";
import { saveObjectUrl, useAdminInvoiceMutation } from "@/lib/api/files-api";
import { hasInvoice } from "@/features/orders/order-extras";

const SHIPMENT_LABEL: Record<AdminOrderView["shipment"]["status"], { label: string; tone: "neutral" | "info" | "success" | "warning" }> = {
  not_required: { label: "No print copies", tone: "neutral" },
  pending: { label: "To ship", tone: "warning" },
  processing: { label: "Being prepared", tone: "info" },
  shipped: { label: "Shipped", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
};

/** Common carriers in Nigeria and abroad, offered as suggestions (any name can be typed). */
const CARRIERS = ["GIG Logistics", "DHL", "FedEx", "UPS", "NIPOST", "Kwik Delivery", "Royal Mail", "Aramex"];

const trackingSchema = z.object({
  carrier: z.string().trim().min(1, "Enter the carrier").max(80),
  trackingNumber: z.string().trim().max(80),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Enter the carrier’s tracking page (starting with https://)"),
});

/** The print side of an order: move it along, with tracking (PRODUCT_RULES §8). */
export function ShipmentPanel({ order }: { order: AdminOrderView }) {
  const [update, state] = useUpdateShipmentMutation();
  const [editing, setEditing] = useState(false);
  const { toast } = useToast();
  const { shipment } = order;
  if (shipment.status === "not_required" || !hasInvoice(order)) return null;
  const refunded = order.status === "refunded";
  const status = SHIPMENT_LABEL[shipment.status];

  const step = async (to: ShipmentStep, details: Partial<z.infer<typeof trackingSchema>> = {}) => {
    try {
      await update({ orderNumber: order.orderNumber, status: to, ...details }).unwrap();
      toast({
        title:
          to === "processing"
            ? "Marked as being prepared"
            : to === "shipped"
              ? shipment.status === "shipped"
                ? "Tracking details updated"
                : "Marked as shipped: the buyer has been emailed"
              : "Marked as delivered: the buyer has been emailed",
        tone: "success",
      });
      setEditing(false);
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-medium">Shipping</h2>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        {!refunded && (
          <div className="flex flex-wrap gap-2">
            {shipment.status === "pending" && (
              <Button size="sm" variant="outline" leadingIcon={<Icon icon={Package} size="sm" />} isLoading={state.isLoading} onClick={() => void step("processing")}>
                Mark as being prepared
              </Button>
            )}
            {(shipment.status === "pending" || shipment.status === "processing") && (
              <Button size="sm" leadingIcon={<Icon icon={Truck} size="sm" />} onClick={() => setEditing(true)}>
                Mark as shipped
              </Button>
            )}
            {shipment.status === "shipped" && (
              <>
                <Button size="sm" variant="outline" leadingIcon={<Icon icon={PencilLine} size="sm" />} onClick={() => setEditing(true)}>
                  Edit tracking
                </Button>
                <Button size="sm" leadingIcon={<Icon icon={CheckCircle2} size="sm" />} isLoading={state.isLoading} onClick={() => void step("delivered")}>
                  Mark as delivered
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {refunded && <p className="text-sm text-text-muted">This order was refunded, so it won’t be shipped.</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-text-muted">Ship to</dt>
        <dd>
          {order.shippingAddress
            ? [order.shippingAddress.fullName, order.shippingAddress.line1, order.shippingAddress.city, order.shippingAddress.country].join(", ")
            : "—"}
        </dd>
        {order.shippingAddress?.phone && (
          <>
            <dt className="text-text-muted">Phone</dt>
            <dd>{order.shippingAddress.phone}</dd>
          </>
        )}
        <dt className="text-text-muted">Items</dt>
        <dd>
          {order.items
            .filter((i) => i.format === "print")
            .map((i) => `${i.title} × ${i.quantity}`)
            .join(", ")}
        </dd>
        {shipment.carrier && (
          <>
            <dt className="text-text-muted">Carrier</dt>
            <dd>
              {shipment.carrier}
              {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ""}
            </dd>
          </>
        )}
      </dl>
      {editing && (
        <TrackingDialog
          initial={{ carrier: shipment.carrier ?? "", trackingNumber: shipment.trackingNumber ?? "", trackingUrl: shipment.trackingUrl ?? "" }}
          correcting={shipment.status === "shipped"}
          saving={state.isLoading}
          onClose={() => setEditing(false)}
          onSave={(details) => void step("shipped", details)}
        />
      )}
    </Card>
  );
}

function TrackingDialog({
  initial,
  correcting,
  saving,
  onClose,
  onSave,
}: {
  initial: z.infer<typeof trackingSchema>;
  correcting: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (details: z.infer<typeof trackingSchema>) => void;
}) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof typeof initial, string>>>({});
  const listId = useId();
  const submit = () => {
    const parsed = trackingSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])));
      return;
    }
    onSave(parsed.data);
  };
  const set = (key: keyof typeof initial) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={correcting ? "Edit tracking details" : "Mark as shipped"}
      description={correcting ? "The buyer isn’t emailed again." : "The buyer gets an email with these details."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={saving} onClick={submit}>
            {correcting ? "Save" : "Mark as shipped"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Carrier" required error={errors.carrier}>
          <Input value={values.carrier} onChange={set("carrier")} list={listId} autoComplete="off" maxLength={80} />
        </FormField>
        <datalist id={listId}>
          {CARRIERS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <FormField label="Tracking number" error={errors.trackingNumber}>
          <Input value={values.trackingNumber} onChange={set("trackingNumber")} autoComplete="off" maxLength={80} />
        </FormField>
        <FormField label="Tracking link" hint="The carrier’s tracking page, if it has one." error={errors.trackingUrl}>
          <Input type="url" inputMode="url" value={values.trackingUrl} onChange={set("trackingUrl")} placeholder="https://" maxLength={500} />
        </FormField>
      </div>
    </Modal>
  );
}

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * What the buyer did with each ebook, for a refund decision (PRODUCT_RULES §9: refundable within
 * 7 days if not downloaded or read beyond the preview).
 */
export function EbookUsagePanel({ usage }: { usage: EbookUsage[] }) {
  if (usage.length === 0) return null;
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-medium">Ebook use</h2>
        <p className="text-sm text-text-muted">The refund policy allows ebook refunds only if the book wasn’t downloaded or read past the free preview.</p>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {usage.map((u) => (
          <li key={u.bookId} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{u.title}</span>
              {u.removed && <Badge tone="neutral" size="sm">Removed from library</Badge>}
              {u.downloads > 0 || u.readBeyondPreview ? (
                <Badge tone="warning" size="sm">Used</Badge>
              ) : (
                <Badge tone="success" size="sm">Not used beyond the preview</Badge>
              )}
            </div>
            <p className="text-sm text-text-muted">
              {u.downloads === 0
                ? "Never downloaded"
                : `Downloaded ${u.downloads} time${u.downloads === 1 ? "" : "s"}, last on ${day.format(new Date(u.lastDownloadedAt!))}`}
              {" · "}
              {u.furthestPage === null
                ? u.firstOpenedAt
                  ? "Opened online"
                  : "Not opened online"
                : `Read online up to page ${u.furthestPage}${u.previewEndsAt ? ` (the preview ends at page ${u.previewEndsAt})` : ""}`}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function AdminInvoiceButton({ orderNumber }: { orderNumber: string }) {
  const [download, state] = useAdminInvoiceMutation();
  const { toast } = useToast();
  return (
    <Button
      variant="outline"
      size="sm"
      leadingIcon={<Icon icon={FileText} size="sm" />}
      isLoading={state.isLoading}
      onClick={() =>
        void download(orderNumber)
          .unwrap()
          .then((url) => saveObjectUrl(url, `invoice-${orderNumber}.pdf`))
          .catch((error: unknown) => toast({ title: "The invoice couldn’t be downloaded", description: errorMessage(error), tone: "danger" }))
      }
    >
      Invoice (PDF)
    </Button>
  );
}
