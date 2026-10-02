"use client";

import { BookOpen, CheckCircle2, Download, ShoppingBag, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, ButtonLink, Icon, PriceTag, RadioGroup, useToast } from "@/components/ui";
import { useAddToCartMutation } from "@/lib/api/commerce-api";
import { errorMessage, errorStatus } from "@/lib/api/errors";
import type { FormatType, PublicFormat } from "@/lib/catalog-types";
import { useOwnedBooksQuery } from "@/lib/api/library-api";
import { useCurrency } from "@/lib/client-currency";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cartOpened } from "@/lib/redux/slices/cart-ui-slice";

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
 * Choose a format and see its price in your currency. "Buy ebook" goes straight to checkout;
 * "Add to cart" (print) opens the cart. Inside the reader, `onCheckout` opens checkout in a drawer
 * over the book instead of leaving it.
 */
export function FormatPicker({
  bookId,
  slug,
  formats,
  hasPreview,
  showPreviewButton = true,
  onCheckout,
}: {
  bookId: string;
  slug: string;
  formats: PublicFormat[];
  hasPreview: boolean;
  /** Off inside the reader itself. */
  showPreviewButton?: boolean;
  onCheckout?: () => void;
}) {
  const purchasable = formats.filter((f) => f.price);
  const [selected, setSelected] = useState<FormatType | undefined>((purchasable.find((f) => f.available) ?? purchasable[0])?.type);
  const current = purchasable.find((f) => f.type === selected);
  const currency = useCurrency();
  const [add, addState] = useAddToCartMutation();
  const [refusedAsOwned, setRefusedAsOwned] = useState(false);
  const signedIn = useAppSelector((state) => state.session.status === "authenticated");
  const { data: ownedBooks } = useOwnedBooksQuery(undefined, { skip: !signedIn });
  // Owners read instead of buying again (checkout refuses a second copy anyway).
  const ownsEbook = refusedAsOwned || Boolean(ownedBooks?.some((b) => b.bookId === bookId));
  const owned = ownsEbook && current?.type === "ebook";
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  if (purchasable.length === 0) {
    return <p className="text-text-muted">This book isn&rsquo;t available in your currency yet.</p>;
  }

  const buy = async () => {
    if (!current || !currency) return;
    try {
      await add({ bookId, format: current.type, quantity: 1, currency }).unwrap();
      if (onCheckout) onCheckout();
      else if (current.type === "ebook") router.push("/checkout");
      else {
        dispatch(cartOpened());
        toast({ title: "Added to your cart", tone: "success" });
      }
    } catch (error) {
      if (errorStatus(error) === 409 && current.type === "ebook") setRefusedAsOwned(true);
      toast({ title: errorMessage(error), tone: "danger" });
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <RadioGroup
        legend="Choose a format"
        variant="cards"
        value={selected}
        onChange={(value) => setSelected(value)}
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
        {owned ? (
          <ButtonLink href={`/account/library/${bookId}/read`} size="lg" variant="accent" fullWidth>
            <Icon icon={BookOpen} size="sm" />
            Read now
          </ButtonLink>
        ) : (
          <Button
            size="lg"
            variant="accent"
            fullWidth
            disabled={!current?.available || !currency}
            isLoading={addState.isLoading}
            loadingLabel="Adding"
            onClick={() => void buy()}
            leadingIcon={<Icon icon={current?.type === "print" ? ShoppingBag : Download} size="sm" />}
          >
            {current?.type === "print" ? "Add to cart" : "Buy ebook"}
          </Button>
        )}
        {!showPreviewButton || owned ? null : hasPreview ? (
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
      {owned ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <Icon icon={CheckCircle2} size="sm" /> This ebook is in your library: read it online or download it any time.
        </p>
      ) : (
        <p className="text-sm text-text-muted">Secure payment with Paystack, Flutterwave or Stripe.</p>
      )}
      {current?.type === "print" && (
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <Icon icon={Truck} size="sm" /> Ships worldwide; the cost for your country is shown before you pay.
        </p>
      )}
    </div>
  );
}
