"use client";

import { Check, Lock, ShoppingBag, Tag } from "lucide-react";
import NextLink from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { z } from "zod";
import {
  Alert,
  BookCover,
  Button,
  ButtonLink,
  Checkbox,
  Divider,
  EmptyState,
  FormField,
  Icon,
  Input,
  Select,
  Skeleton,
  TextLink,
  useToast,
} from "@/components/ui";
import { useCart } from "@/features/cart/use-cart";
import { useAddressesQuery } from "@/lib/api/auth-api";
import { usePlaceOrderMutation, useQuoteMutation, type OrderView, type Quote, type ShippingAddressInput } from "@/lib/api/commerce-api";
import { errorMessage, errorProblems } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { countryName, countryOptions } from "@/lib/countries";
import { formatMoney, type Currency } from "@/lib/money";
import { useAppSelector } from "@/lib/redux/hooks";
import { checkoutKeyFor, fingerprintOf, forgetCheckoutKey, rememberGuestOrder } from "./checkout-key";
import { PayNow } from "./pay-now";

type Step = "details" | "shipping" | "review";

const detailsSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("Enter a valid email address"),
  name: z.string().trim().min(1, "Enter your name").max(120),
});

const addressSchema = z.object({
  fullName: z.string().trim().min(1, "Enter the recipient's name").max(120),
  phone: z.string().trim().min(6, "Enter a phone number for the courier").max(30),
  line1: z.string().trim().min(1, "Enter the street address").max(200),
  line2: z.string().trim().max(200),
  city: z.string().trim().min(1, "Enter the city").max(100),
  state: z.string().trim().max(100),
  postalCode: z.string().trim().max(20),
  country: z.string().length(2, "Choose a country"),
});

type AddressDraft = z.infer<typeof addressSchema>;
const EMPTY_ADDRESS: AddressDraft = { fullName: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "" };

/** The first problem per field ("Enter your email" before "Enter a valid email address"). */
const fieldErrors = (result: { success: boolean; error?: z.ZodError }) => {
  const errors: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) errors[String(issue.path[0])] ??= issue.message;
  return errors;
};

/**
 * Checkout (PRODUCT_RULES §6): Details → Shipping (only for print) → Review & pay. Every amount on
 * "Review" comes from the server's quote; the order is placed with an idempotency key, so a retry
 * never creates a second order. Used on /checkout and in a drawer over the preview reader.
 */
export function CheckoutFlow({ returnPath, onNavigate }: { returnPath?: string; onNavigate?: () => void }) {
  const { data: cart, isLoading, currency } = useCart();
  const session = useAppSelector((state) => state.session);
  const signedIn = session.status === "authenticated";
  const user = session.user;
  const addresses = useAddressesQuery(undefined, { skip: !signedIn });
  const [step, setStep] = useState<Step>("details");
  const [details, setDetails] = useState({ email: "", name: "" });
  const [address, setAddress] = useState<AddressDraft>(EMPTY_ADDRESS);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [placed, setPlaced] = useState<OrderView | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [runQuote, quoteState] = useQuoteMutation();
  const [place, placeState] = usePlaceOrderMutation();
  const { toast } = useToast();

  const okLines = cart?.lines.filter((l) => l.status === "ok") ?? [];
  const needsShipping = okLines.some((l) => l.format === "print");
  const steps: Step[] = needsShipping ? ["details", "shipping", "review"] : ["details", "review"];
  const email = signedIn ? (user?.email ?? "") : details.email;

  // A signed-in buyer's default address, once, as a starting point.
  const defaultAddress = addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];
  const [prefilled, setPrefilled] = useState(false);
  if (defaultAddress && !prefilled) {
    setPrefilled(true);
    setAddress({ ...EMPTY_ADDRESS, ...defaultAddress });
  }

  const quote: Quote | undefined = quoteState.data;
  const refreshQuote = (code: string | null = couponCode) => {
    if (!currency) return;
    void runQuote({
      currency,
      ...(needsShipping && address.country ? { shippingCountry: address.country } : {}),
      ...(code ? { couponCode: code } : {}),
      ...(!signedIn && details.email ? { email: details.email } : {}),
    });
  };

  // Re-quote whenever what is priced changes while reviewing (currency switch, cart edits).
  const cartSignature = okLines.map((l) => `${l.bookId}:${l.format}:${l.quantity}`).join("|");
  useEffect(() => {
    if (step === "review") refreshQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, currency, cartSignature]);

  const fingerprint = useMemo(
    () =>
      fingerprintOf({
        currency: currency ?? "",
        lines: okLines.map((l) => ({ bookId: l.bookId, format: l.format, quantity: l.quantity })),
        country: needsShipping ? address.country || null : null,
        couponCode,
        email: email || null,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, cartSignature, needsShipping, address.country, couponCode, email],
  );

  if (placed) return <OrderPlaced order={placed} signedIn={signedIn} onNavigate={onNavigate} />;

  if (isLoading || !currency || session.status === "checking") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }
  if (!cart || okLines.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title={cart?.lines.length ? "Your cart needs attention" : "Your cart is empty"}
        description={cart?.problems[0] ?? "Add a book to check out."}
        action={
          <ButtonLink href={cart?.lines.length ? "/cart" : "/books"} onClick={onNavigate}>
            {cart?.lines.length ? "Review your cart" : "Browse the books"}
          </ButtonLink>
        }
      />
    );
  }

  const goNext = () => {
    setErrors({});
    if (step === "details") {
      if (!signedIn) {
        const result = detailsSchema.safeParse(details);
        if (!result.success) return setErrors(fieldErrors(result));
      }
      setStep(needsShipping ? "shipping" : "review");
    } else if (step === "shipping") {
      const result = addressSchema.safeParse(address);
      if (!result.success) return setErrors(fieldErrors(result));
      setStep("review");
    }
  };

  const placeOrder = async () => {
    if (!terms) {
      setErrors({ terms: "Please accept the Terms of Sale to continue" });
      return;
    }
    setRefused([]);
    const checkoutKey = checkoutKeyFor(fingerprint);
    const shippingAddress: ShippingAddressInput | undefined = needsShipping
      ? { ...address, line2: address.line2 || undefined, state: address.state || undefined, postalCode: address.postalCode || undefined }
      : undefined;
    try {
      const order = await place({
        checkoutKey,
        currency,
        acceptTerms: true,
        ...(signedIn ? {} : { email: details.email.trim(), name: details.name.trim() }),
        ...(shippingAddress ? { shippingAddress } : {}),
        ...(couponCode ? { couponCode } : {}),
        ...(returnPath ? { returnPath } : {}),
      }).unwrap();
      if (!signedIn) rememberGuestOrder(order.orderNumber, checkoutKey);
      forgetCheckoutKey();
      setPlaced(order);
    } catch (error) {
      const problems = errorProblems(error);
      setRefused(problems);
      if (!problems.length) toast({ title: errorMessage(error), tone: "danger" });
      refreshQuote();
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Checkout steps">
        {steps.map((s, index) => {
          const done = steps.indexOf(step) > index;
          const current = s === step;
          return (
            <li key={s} className="flex items-center gap-2">
              {index > 0 && <span className="hidden h-px w-4 bg-border-strong sm:block" aria-hidden />}
              <button
                type="button"
                disabled={!done}
                onClick={() => setStep(s)}
                aria-current={current ? "step" : undefined}
                className={cn(
                  "flex min-h-9 items-center gap-2 rounded-full px-3 font-medium",
                  current ? "bg-primary text-on-primary" : done ? "bg-secondary text-text hover:bg-secondary-hover" : "text-text-subtle",
                )}
              >
                <span className="flex size-5 items-center justify-center rounded-full border border-current text-xs">
                  {done ? <Icon icon={Check} size="xs" /> : index + 1}
                </span>
                {s === "details" ? "Details" : s === "shipping" ? "Shipping" : "Review & pay"}
              </button>
            </li>
          );
        })}
      </ol>

      {step === "details" && (
        <StepCard title="Your details">
          {signedIn && user ? (
            <p className="text-text">
              Signed in as <span className="font-medium">{user.name}</span> ({user.email}). Your receipt and books go to this account.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <FormField label="Email" required error={errors.email} hint="Your receipt and download link are sent here.">
                <Input type="email" autoComplete="email" inputMode="email" value={details.email} onChange={(e) => setDetails((d) => ({ ...d, email: e.target.value }))} />
              </FormField>
              <FormField label="Full name" required error={errors.name}>
                <Input autoComplete="name" value={details.name} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} />
              </FormField>
              <p className="text-sm text-text-muted">
                No account needed. We&rsquo;ll keep your books in a library you can open later with a link we email you.{" "}
                <TextLink href={`/login?next=${encodeURIComponent("/checkout")}`}>Already have an account? Sign in</TextLink>
              </p>
            </div>
          )}
          <Button size="lg" onClick={goNext} className="self-stretch sm:self-end">
            Continue
          </Button>
        </StepCard>
      )}

      {step === "shipping" && (
        <StepCard title="Where should we send your print copy?">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Recipient's name" required error={errors.fullName}>
              <Input autoComplete="shipping name" value={address.fullName} onChange={(e) => setAddress((a) => ({ ...a, fullName: e.target.value }))} />
            </FormField>
            <FormField label="Phone" required error={errors.phone} hint="For the courier only.">
              <Input type="tel" autoComplete="shipping tel" inputMode="tel" value={address.phone} onChange={(e) => setAddress((a) => ({ ...a, phone: e.target.value }))} />
            </FormField>
            <FormField label="Address" required error={errors.line1} className="sm:col-span-2">
              <Input autoComplete="shipping address-line1" value={address.line1} onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))} />
            </FormField>
            <FormField label="Apartment, building (optional)" className="sm:col-span-2">
              <Input autoComplete="shipping address-line2" value={address.line2} onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))} />
            </FormField>
            <FormField label="City" required error={errors.city}>
              <Input autoComplete="shipping address-level2" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
            </FormField>
            <FormField label="State / region">
              <Input autoComplete="shipping address-level1" value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} />
            </FormField>
            <FormField label="Postal code">
              <Input autoComplete="shipping postal-code" value={address.postalCode} onChange={(e) => setAddress((a) => ({ ...a, postalCode: e.target.value }))} />
            </FormField>
            <FormField label="Country" required error={errors.country}>
              <Select
                autoComplete="shipping country"
                placeholder="Choose a country"
                options={countryOptions()}
                value={address.country}
                onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
              />
            </FormField>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => setStep("details")}>
              Back
            </Button>
            <Button size="lg" onClick={goNext}>
              Continue
            </Button>
          </div>
        </StepCard>
      )}

      {step === "review" && (
        <StepCard title="Review & pay">
          <Review quote={quote} loading={quoteState.isLoading && !quote} currency={currency} />

          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const code = couponInput.trim() || null;
              setCouponCode(code);
              refreshQuote(code);
            }}
          >
            <FormField label="Discount code" hideLabel>
              <div className="flex gap-2">
                <Input
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Discount code"
                  autoCapitalize="characters"
                  leading={<Icon icon={Tag} size="sm" />}
                  className="flex-1"
                />
                <Button type="submit" variant="outline" isLoading={quoteState.isLoading && !!couponInput}>
                  Apply
                </Button>
              </div>
            </FormField>
            {quote?.coupon && (
              <p className={cn("text-sm", quote.coupon.applied ? "text-success" : "text-danger")} role="status">
                {quote.coupon.applied ? `${quote.coupon.code} applied` : quote.coupon.message}
                {couponCode && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-2 h-auto px-1 py-0 underline"
                    onClick={() => {
                      setCouponInput("");
                      setCouponCode(null);
                      refreshQuote(null);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </p>
            )}
          </form>

          {needsShipping && (
            <p className="text-sm text-text-muted">
              Shipping to {address.fullName}, {address.city}, {countryName(address.country)}.{" "}
              <Button variant="ghost" size="sm" className="h-auto px-1 py-0 underline" onClick={() => setStep("shipping")}>
                Change
              </Button>
            </p>
          )}

          {(refused.length > 0 || (quote && quote.problems.length > 0)) && (
            <Alert tone="danger" title="Your order needs a change">
              <ul className="list-disc pl-5">
                {(refused.length ? refused : quote!.problems).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Checkbox
            checked={terms}
            onChange={(e) => {
              setTerms(e.target.checked);
              setErrors({});
            }}
            label={
              <span>
                I agree to the{" "}
                <TextLink href="/legal/terms" target="_blank">
                  Terms of Sale
                </TextLink>
                . Ebooks are delivered immediately after payment.
              </span>
            }
            aria-invalid={errors.terms ? true : undefined}
          />
          {errors.terms && <p className="text-sm text-danger">{errors.terms}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={() => setStep(needsShipping ? "shipping" : "details")}>
              Back
            </Button>
            <Button
              size="lg"
              variant="accent"
              isLoading={placeState.isLoading}
              loadingLabel="Placing your order"
              disabled={!quote || quote.problems.length > 0 || quoteState.isLoading}
              onClick={() => void placeOrder()}
              leadingIcon={<Icon icon={Lock} size="sm" />}
            >
              {quote ? `Place order · ${formatMoney({ amount: quote.total, currency })}` : "Place order"}
            </Button>
          </div>
          <p className="text-xs text-text-subtle">
            Your books and any discount are held for 30 minutes while you pay. Card details are entered only on the payment provider&rsquo;s secure page.
          </p>
        </StepCard>
      )}
    </div>
  );
}

function StepCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-label={title}>
      <h2 className="text-2xl font-medium">{title}</h2>
      {children}
    </section>
  );
}

/** Every amount here is the server's: this is exactly what the payment page will charge. */
function Review({ quote, loading, currency }: { quote: Quote | undefined; loading: boolean; currency: Currency }) {
  if (loading || !quote) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const money = (amount: number) => formatMoney({ amount, currency });
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {quote.lines
          .filter((l) => l.status === "ok")
          .map((line) => (
            <li key={`${line.bookId}-${line.format}`} className="flex items-center gap-3">
              <BookCover title={line.title} src={line.cover} size="xs" />
              <div className="min-w-0 flex-1">
                <p className="font-display leading-snug text-text">{line.title}</p>
                <p className="text-sm text-text-muted">
                  {line.format === "ebook" ? "Ebook (PDF)" : `Print × ${line.quantity}`}
                </p>
              </div>
              <span className="font-medium tabular-nums">{money(line.lineTotal)}</span>
            </li>
          ))}
      </ul>
      <Divider />
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
        <dt className="text-text-muted">Subtotal</dt>
        <dd className="text-right tabular-nums">{money(quote.subtotal)}</dd>
        {quote.discountTotal > 0 && (
          <>
            <dt className="text-text-muted">Discount{quote.coupon?.applied ? ` (${quote.coupon.code})` : ""}</dt>
            <dd className="text-right text-success tabular-nums">−{money(quote.discountTotal)}</dd>
          </>
        )}
        {quote.requiresShipping && (
          <>
            <dt className="text-text-muted">
              Shipping
              {quote.shipping.estimatedDays && (
                <span className="block text-xs text-text-subtle">
                  Arrives in {quote.shipping.estimatedDays.min}–{quote.shipping.estimatedDays.max} working days
                </span>
              )}
            </dt>
            <dd className="text-right tabular-nums">{quote.shipping.available ? money(quote.shippingTotal) : "—"}</dd>
          </>
        )}
        <dt className="pt-2 text-base font-medium text-text">Total</dt>
        <dd className="pt-2 text-right font-display text-2xl tabular-nums">{money(quote.total)}</dd>
      </dl>
      <p className="text-xs text-text-subtle">Prices include any applicable tax.</p>
    </div>
  );
}

function OrderPlaced({ order, signedIn, onNavigate }: { order: OrderView; signedIn: boolean; onNavigate?: () => void }) {
  const until = order.expiresAt ? new Date(order.expiresAt) : null;
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="placed-heading">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success">
          <Icon icon={Check} size="md" />
        </span>
        <div className="flex flex-col gap-1">
          <h2 id="placed-heading" className="text-2xl font-medium">
            Order {order.orderNumber}: one step left
          </h2>
          <p className="text-text-muted">
            Your books are held
            {until ? ` until ${until.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""} while you pay. Nothing has been charged yet.
          </p>
        </div>
      </div>
      <PayNow order={order} guest={!signedIn} />
      <p className="text-xs text-text-subtle">
        Your receipt goes to {order.email} as soon as the payment is confirmed.{" "}
        <NextLink href={signedIn ? `/account/orders/${order.orderNumber}` : `/checkout/order/${order.orderNumber}`} onClick={onNavigate} className="underline underline-offset-4">
          View the order
        </NextLink>
      </p>
    </section>
  );
}
