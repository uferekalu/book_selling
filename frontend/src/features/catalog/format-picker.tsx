"use client";

import { BookOpen, CheckCircle2, Download, ShoppingBag, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Icon, PriceTag, RadioGroup, useToast } from "@/components/ui";
import { useAddToCartMutation } from "@/lib/api/commerce-api";
import { errorMessage, errorStatus } from "@/lib/api/errors";
import { readPath } from "@/lib/catalog-links";
import type { BookKind, FormatType, PublicFormat } from "@/lib/catalog-types";
import { useOwnedBooksQuery } from "@/lib/api/library-api";
import { useCurrency } from "@/lib/client-currency";
import { prefetchPdfJs } from "@/features/reader/pdf";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cartOpened } from "@/lib/redux/slices/cart-ui-slice";

const LABEL: Record<FormatType, string> = { ebook: "Ebook (PDF)", print: "Print" };
const DESCRIPTION: Record<FormatType, string> = {
  ebook: "Instant access: read online on any device or download",
  print: "Paperback, shipped to you",
};

/** A paper is one PDF (BS-34), so its words differ from a book's. */
const PAPER = {
  label: "Full paper (PDF)",
  description: "Instant access: read online or download",
  buy: "Buy the paper",
  preview: "Read the first pages free",
  unavailable: "This paper isn’t available in your currency yet.",
  owned: "This paper is in your library: read it online or download it any time.",
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
  kind = "book",
  formats,
  hasPreview,
  showPreviewButton = true,
  onCheckout,
}: {
  bookId: string;
  slug: string;
  kind?: BookKind;
  formats: PublicFormat[];
  hasPreview: boolean;
  /** Off inside the reader itself. */
  showPreviewButton?: boolean;
  onCheckout?: () => void;
}) {
  const isPaper = kind === "paper";
  // A paper has no print copy; the API never offers one, and this never shows one.
  const purchasable = formats.filter((f) => f.price && (!isPaper || f.type === "ebook"));
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
  // Once the page is idle, fetch the reader's PDF engine so "Read the introduction" opens fast.
  useEffect(() => {
    if (!hasPreview || !showPreviewButton) return;
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => prefetchPdfJs());
    return () => cancel(handle);
  }, [hasPreview, showPreviewButton]);
  const dispatch = useAppDispatch();
  const { toast } = useToast();

  if (purchasable.length === 0) {
    return <p className="text-text-muted">{isPaper ? PAPER.unavailable : "This book isn’t available in your currency yet."}</p>;
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
        legend={isPaper ? "Buy the full paper" : "Choose a format"}
        variant="cards"
        value={selected}
        onChange={(value) => setSelected(value)}
        options={purchasable.map((format) => ({
          value: format.type,
          label: (
            <span className="flex flex-wrap items-center gap-2">
              {isPaper ? PAPER.label : LABEL[format.type]}
              {stockBadge(format)}
            </span>
          ),
          description: isPaper ? PAPER.description : DESCRIPTION[format.type],
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
            {current?.type === "print" ? "Add to cart" : isPaper ? PAPER.buy : "Buy ebook"}
          </Button>
        )}
        {!showPreviewButton || owned ? null : hasPreview ? (
          <ButtonLink href={readPath(kind, slug)} size="lg" variant="outline" fullWidth>
            <Icon icon={BookOpen} size="sm" />
            {isPaper ? PAPER.preview : "Read the introduction"}
          </ButtonLink>
        ) : (
          <Button size="lg" variant="outline" fullWidth disabled leadingIcon={<Icon icon={BookOpen} size="sm" />}>
            Free preview coming soon
          </Button>
        )}
      </div>
      {owned ? (
        <p className="flex items-center gap-2 text-sm text-success">
          <Icon icon={CheckCircle2} size="sm" /> {isPaper ? PAPER.owned : "This ebook is in your library: read it online or download it any time."}
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
