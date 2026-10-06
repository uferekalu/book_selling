"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, TicketPercent } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Alert, Badge, Button, Card, Checkbox, EmptyState, FormField, Icon, Input, Modal, MoneyInput, RadioGroup, Skeleton, Switch, useToast } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { useAdminCouponsQuery, useCreateCouponMutation, useUpdateCouponMutation, type Coupon } from "@/lib/api/engagement-api";
import { CURRENCIES, CURRENCY_LABEL, formatMoney } from "@/lib/money";
import { AdminQueryError } from "./admin-query-error";
import { couponFormSchema, couponInputFrom, formFromCoupon, type CouponFormValues } from "./coupon-form";

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** What a code takes off, in words: "10% off" or "₦2,500 off / $3.00 off". */
function discountLabel(c: Coupon): string {
  if (c.kind === "percent") return `${c.percentOff}% off`;
  return c.amountsOff.map((a) => `${formatMoney(a)} off`).join(" / ");
}

function windowLabel(c: Coupon): string | null {
  if (c.startsAt && c.endsAt) return `${day.format(new Date(c.startsAt))} – ${day.format(new Date(c.endsAt))}`;
  if (c.startsAt) return `From ${day.format(new Date(c.startsAt))}`;
  if (c.endsAt) return `Until ${day.format(new Date(c.endsAt))}`;
  return null;
}

function stateOf(c: Coupon, now = Date.now()): { label: string; tone: "success" | "neutral" | "warning" } {
  if (!c.active) return { label: "Switched off", tone: "neutral" };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: "Ended", tone: "neutral" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: "Scheduled", tone: "warning" };
  if (c.maxRedemptions && c.redemptionCount >= c.maxRedemptions) return { label: "Used up", tone: "neutral" };
  return { label: "Active", tone: "success" };
}

/**
 * Discount codes (PRODUCT_RULES §6): percentage or fixed amount per currency, minimum spend, a
 * date window, total and per-customer limits, ebooks and/or print. Buyers type one at checkout;
 * the server checks every rule again when the order is placed.
 */
export function CouponsAdmin() {
  const { data, isLoading, error, refetch } = useAdminCouponsQuery();
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);

  if (error) return <AdminQueryError error={error} onRetry={() => void refetch()} />;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-text-muted">
          Codes buyers type at checkout. One code per order; uses held for an unpaid order come back if it expires. Switch a code off to stop it at
          once.
        </p>
        <Button leadingIcon={<Icon icon={Plus} size="sm" />} onClick={() => setEditing("new")}>
          New code
        </Button>
      </div>
      {isLoading || !data ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !data.length ? (
        <EmptyState icon={TicketPercent} title="No discount codes yet" description="Create one for a class, a launch or returning readers, e.g. LECTURE10 for 10% off." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.map((c) => {
            const s = stateOf(c);
            const window = windowLabel(c);
            return (
              <li key={c.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-lg font-semibold wrap-anywhere text-text">{c.code}</p>
                      <p className="text-sm text-text-muted">{discountLabel(c)}</p>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  {c.description && <p className="text-sm text-text-muted wrap-anywhere">{c.description}</p>}
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <dt className="text-text-subtle">Used</dt>
                    <dd>
                      {c.redemptionCount}
                      {c.maxRedemptions ? ` of ${c.maxRedemptions}` : ""}
                    </dd>
                    <dt className="text-text-subtle">For</dt>
                    <dd>{c.appliesTo.formats.length === 1 ? (c.appliesTo.formats[0] === "ebook" ? "Ebooks" : "Print copies") : "Ebooks and print"}</dd>
                    {c.perCustomerLimit && (
                      <>
                        <dt className="text-text-subtle">Per customer</dt>
                        <dd>{c.perCustomerLimit}</dd>
                      </>
                    )}
                    {c.minSubtotals.length > 0 && (
                      <>
                        <dt className="text-text-subtle">Minimum spend</dt>
                        <dd>{c.minSubtotals.map((a) => formatMoney(a)).join(" / ")}</dd>
                      </>
                    )}
                    {window && (
                      <>
                        <dt className="text-text-subtle">When</dt>
                        <dd>{window}</dd>
                      </>
                    )}
                  </dl>
                  <Button size="sm" variant="outline" className="mt-auto self-start" onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <CouponDialog coupon={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CouponDialog({ coupon, onClose }: { coupon: Coupon | null; onClose: () => void }) {
  const [create, createState] = useCreateCouponMutation();
  const [update, updateState] = useUpdateCouponMutation();
  const { toast } = useToast();
  const form = useForm<CouponFormValues>({ resolver: zodResolver(couponFormSchema), defaultValues: formFromCoupon(coupon) });
  const kind = useWatch({ control: form.control, name: "kind" });
  const saving = createState.isLoading || updateState.isLoading;
  const failure = createState.error ?? updateState.error;
  const errors = form.formState.errors;

  const onValid = async (values: CouponFormValues) => {
    const input = couponInputFrom(values, coupon?.appliesTo.bookIds ?? []);
    try {
      if (coupon) await update({ id: coupon.id, input }).unwrap();
      else await create(input).unwrap();
      toast({ title: coupon ? `${input.code} saved` : `${input.code} created`, tone: "success" });
      onClose();
    } catch {
      // shown via the alert
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={coupon ? `Edit ${coupon.code}` : "New discount code"}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button isLoading={saving} onClick={() => void form.handleSubmit(onValid)()}>
            {coupon ? "Save" : "Create code"}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void form.handleSubmit(onValid)(e)} noValidate className="flex flex-col gap-5">
        {failure && <Alert tone="danger" title={errorMessage(failure)} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Code" required hint="What buyers type, e.g. LECTURE10" error={errors.code?.message}>
            <Input {...form.register("code")} autoCapitalize="characters" autoComplete="off" maxLength={30} />
          </FormField>
          <FormField label="Note for you (optional)" error={errors.description?.message}>
            <Input {...form.register("description")} maxLength={200} placeholder="e.g. MME 302 class, first semester" />
          </FormField>
        </div>

        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <RadioGroup<"percent" | "fixed">
              legend="Discount"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "percent", label: "A percentage off", description: "Works in every currency" },
                { value: "fixed", label: "A fixed amount off", description: "Set per currency; others can't use it" },
              ]}
            />
          )}
        />
        {kind === "percent" ? (
          <FormField label="Percentage off" required error={errors.percentOff?.message} className="sm:w-48">
            <Input {...form.register("percentOff")} inputMode="numeric" trailing="%" />
          </FormField>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-text">Amount off</legend>
            {errors.amountsOff && <p className="text-sm text-danger">{errors.amountsOff.message}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {CURRENCIES.map((c) => (
                <Controller
                  key={c}
                  control={form.control}
                  name={`amountsOff.${c}`}
                  render={({ field }) => (
                    <FormField label={CURRENCY_LABEL[c]}>
                      <MoneyInput currency={c} value={field.value} onChange={field.onChange} />
                    </FormField>
                  )}
                />
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-text">Applies to</legend>
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Ebooks" {...form.register("ebook")} />
            <Checkbox label="Print copies" {...form.register("print")} />
          </div>
          {errors.ebook && <p className="text-sm text-danger">{errors.ebook.message}</p>}
          {!!coupon?.appliesTo.bookIds.length && (
            <p className="text-xs text-text-subtle">Also limited to {coupon.appliesTo.bookIds.length} specific book(s); that limit is kept.</p>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-text">Minimum spend (optional)</legend>
          <p className="text-xs text-text-subtle">The books’ total before the discount. Leave a currency empty for no minimum.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CURRENCIES.map((c) => (
              <Controller
                key={c}
                control={form.control}
                name={`minSubtotals.${c}`}
                render={({ field }) => (
                  <FormField label={CURRENCY_LABEL[c]}>
                    <MoneyInput currency={c} value={field.value} onChange={field.onChange} />
                  </FormField>
                )}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Starts (optional)" error={errors.startsAt?.message}>
            <Input type="datetime-local" {...form.register("startsAt")} />
          </FormField>
          <FormField label="Ends (optional)" error={errors.endsAt?.message}>
            <Input type="datetime-local" {...form.register("endsAt")} />
          </FormField>
          <FormField label="Total uses (optional)" hint="Leave empty for no limit" error={errors.maxRedemptions?.message}>
            <Input {...form.register("maxRedemptions")} inputMode="numeric" />
          </FormField>
          <FormField label="Uses per customer (optional)" hint="Usually 1" error={errors.perCustomerLimit?.message}>
            <Input {...form.register("perCustomerLimit")} inputMode="numeric" />
          </FormField>
        </div>

        <Controller
          control={form.control}
          name="active"
          render={({ field }) => (
            <Switch checked={field.value} onCheckedChange={field.onChange} label="Active" description="Switch off to stop the code immediately; past orders are not affected." />
          )}
        />
      </form>
    </Modal>
  );
}
