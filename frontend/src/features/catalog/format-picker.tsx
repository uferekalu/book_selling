"use client";

import { BookOpen, Download, ShoppingBag, Truck } from "lucide-react";
import { useState } from "react";
import { Badge, Button, ButtonLink, Icon, PriceTag, RadioGroup } from "@/components/ui";
import type { FormatType, PublicFormat } from "@/lib/catalog-types";

const LABEL: Record<FormatType, string> = { ebook: "Ebook (PDF)", print: "Print" };
const DESCRIPTION: Record<FormatType, string> = {
  ebook: "Instant access: read online on any device or download",
  print: "Paperback, shipped to you",
};

function stockBadge(format: PublicFormat) {
  if (format.type !== "print") return null;
  if (format.stock === "out_of_stock") return <Badge tone="danger" size="sm">Out of stock</Badge>;
  if (format.stock === "low_stock") return <Badge tone="warning" size="sm">Only {format.stockLeft} left</Badge>;
  return <Badge tone="success" size="sm">In stock</Badge>;
}

/**
 * Choose a format and see its price in your currency. Buying arrives with checkout (BS-7) and the
 * free reader with BS-6; until then the buttons say so plainly rather than pretending to work.
 */
export function FormatPicker({ slug, formats, hasPreview }: { slug: string; formats: PublicFormat[]; hasPreview: boolean }) {
  const purchasable = formats.filter((f) => f.price);
  const [selected, setSelected] = useState<FormatType | undefined>(
    (purchasable.find((f) => f.available) ?? purchasable[0])?.type,
  );
  const current = purchasable.find((f) => f.type === selected);

  if (purchasable.length === 0) {
    return <p className="text-text-muted">This book isn&rsquo;t available in your currency yet.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <RadioGroup
        legend="Choose a format"
        variant="cards"
        value={selected}
        onChange={setSelected}
        options={purchasable.map((format) => ({
          value: format.type,
          label: (
            <span className="flex flex-wrap items-center gap-2">
              {LABEL[format.type]}
              {stockBadge(format)}
            </span>
          ),
          description: DESCRIPTION[format.type],
          aside: <PriceTag price={format.price!} compareAt={format.compareAt} size="sm" />,
          disabled: !format.available,
        }))}
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          variant="accent"
          fullWidth
          disabled
          aria-describedby="checkout-note"
          leadingIcon={<Icon icon={current?.type === "print" ? ShoppingBag : Download} size="sm" />}
        >
          {current?.type === "print" ? "Add to cart" : "Buy ebook"}
        </Button>
        {hasPreview ? (
          <ButtonLink href={`/books/${slug}/read`} size="lg" variant="outline" fullWidth>
            <Icon icon={BookOpen} size="sm" />
            Read the introduction
          </ButtonLink>
        ) : (
          <Button size="lg" variant="outline" fullWidth disabled leadingIcon={<Icon icon={BookOpen} size="sm" />}>
            Free preview coming soon
          </Button>
        )}
      </div>
      <p id="checkout-note" className="text-sm text-text-muted">
        Online checkout opens shortly. Secure payment with Paystack, Flutterwave or Stripe.
      </p>
      {current?.type === "print" && (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Icon icon={Truck} size="sm" /> Ships worldwide; the cost for your country is shown before you pay.
        </p>
      )}
    </div>
  );
}
