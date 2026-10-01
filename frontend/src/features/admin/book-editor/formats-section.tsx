"use client";

import { useMemo, useState } from "react";
import { Badge, FormField, Input, MoneyInput, Switch, useToast } from "@/components/ui";
import { useSetFormatsMutation, type AdminBook, type FormatInput, type Price } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import type { FormatType } from "@/lib/catalog-types";
import { CURRENCIES, CURRENCY_LABEL, formatMoney, type Currency } from "@/lib/money";
import { useReportDirty } from "./dirty";
import { EditorSection } from "./section";

type Amounts = Record<Currency, number | null>;

interface FormatDraft {
  active: boolean;
  prices: Amounts;
  onSale: boolean;
  compareAt: Amounts;
  stampWithBuyer: boolean;
  stockOnHand: string;
  weightGrams: string;
  maxPerOrder: string;
}

type Drafts = Record<FormatType, FormatDraft>;

const empty = (): Amounts => ({ NGN: null, USD: null, GBP: null, EUR: null });
const amounts = (prices: Price[]): Amounts => {
  const result = empty();
  for (const p of prices) result[p.currency] = p.amount;
  return result;
};
const toPrices = (values: Amounts): Price[] =>
  CURRENCIES.flatMap((currency) => (values[currency] !== null ? [{ currency, amount: values[currency]! }] : []));

export function draftsFromBook(book: AdminBook): Drafts {
  const make = (type: FormatType): FormatDraft => {
    const f = book.formats.find((x) => x.type === type);
    return {
      active: f?.active ?? false,
      prices: amounts(f?.prices ?? []),
      onSale: (f?.compareAtPrices.length ?? 0) > 0,
      compareAt: amounts(f?.compareAtPrices ?? []),
      stampWithBuyer: f?.ebook?.stampWithBuyer ?? true,
      stockOnHand: String(f?.print?.stockOnHand ?? 0),
      weightGrams: String(f?.print?.weightGrams ?? 0),
      maxPerOrder: String(f?.print?.maxPerOrder ?? 5),
    };
  };
  return { ebook: make("ebook"), print: make("print") };
}

const wholeNumber = (text: string, max: number) => /^\d+$/.test(text.trim()) && Number(text) <= max;

/** Problems that stop a save (the publish checklist separately lists missing prices). */
export function formatProblems(drafts: Drafts, invalidInputs: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  if (invalidInputs.size) problems.push("Some prices can't be read; use digits with up to 2 decimals, like 29.99.");
  for (const type of ["ebook", "print"] as const) {
    const d = drafts[type];
    const label = type === "ebook" ? "Ebook" : "Print";
    if (d.onSale) {
      for (const currency of CURRENCIES) {
        const was = d.compareAt[currency];
        const now = d.prices[currency];
        if (was !== null && (now === null || was <= now)) problems.push(`${label}: the "was" price in ${currency} must be higher than the price.`);
      }
    }
    if (type === "print") {
      if (!wholeNumber(d.stockOnHand, 1_000_000)) problems.push("Print: stock must be a whole number.");
      if (!wholeNumber(d.weightGrams, 20_000)) problems.push("Print: weight must be a whole number of grams (up to 20000).");
      if (!wholeNumber(d.maxPerOrder, 50) || Number(d.maxPerOrder) < 1) problems.push("Print: the per-order limit must be between 1 and 50.");
    }
  }
  return problems;
}

export function draftsToInput(drafts: Drafts, book: AdminBook): FormatInput[] {
  return (["ebook", "print"] as const)
    .filter((type) => drafts[type].active || book.formats.some((f) => f.type === type) || toPrices(drafts[type].prices).length > 0)
    .map((type) => {
      const d = drafts[type];
      return {
        type,
        active: d.active,
        prices: toPrices(d.prices),
        compareAtPrices: d.onSale ? toPrices(d.compareAt) : [],
        ...(type === "ebook"
          ? { ebook: { stampWithBuyer: d.stampWithBuyer } }
          : { print: { stockOnHand: Number(d.stockOnHand), weightGrams: Number(d.weightGrams), maxPerOrder: Number(d.maxPerOrder) } }),
      };
    });
}

export function FormatsSection({ book }: { book: AdminBook }) {
  const [saved, setSaved] = useState(() => draftsFromBook(book));
  const [drafts, setDrafts] = useState(saved);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [save, state] = useSetFormatsMutation();
  const { toast } = useToast();
  const dirty = JSON.stringify(drafts) !== JSON.stringify(saved);
  useReportDirty("formats", dirty);
  const problems = useMemo(() => formatProblems(drafts, invalid), [drafts, invalid]);

  // When the server copy changes (this or another section saved), refresh the baseline, and the
  // fields too unless they hold unsaved edits. Done during render, as React recommends.
  const [syncedAt, setSyncedAt] = useState(book.updatedAt);
  if (book.updatedAt !== syncedAt) {
    setSyncedAt(book.updatedAt);
    const next = draftsFromBook(book);
    setSaved(next);
    if (!dirty) setDrafts(next);
  }

  const patch = (type: FormatType, change: Partial<FormatDraft>) => setDrafts((all) => ({ ...all, [type]: { ...all[type], ...change } }));
  const markValidity = (key: string, valid: boolean) =>
    setInvalid((current) => {
      if (current.has(key) === !valid) return current;
      const next = new Set(current);
      if (valid) next.delete(key);
      else next.add(key);
      return next;
    });

  const onSave = async () => {
    if (problems.length) {
      toast({ title: "Check the prices", description: problems[0], tone: "danger" });
      return;
    }
    try {
      const result = await save({ id: book.id, formats: draftsToInput(drafts, book) }).unwrap();
      const next = draftsFromBook(result);
      setSaved(next);
      setDrafts(next);
      toast({ title: "Formats and prices saved", tone: "success" });
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  };

  return (
    <EditorSection
      id="formats"
      title="Formats & prices"
      description="Set a price in every currency for each format you sell. Prices are exact; there is no automatic conversion."
      dirty={dirty}
      saving={state.isLoading}
      onSave={() => void onSave()}
      onReset={() => {
        setDrafts(saved);
        setInvalid(new Set());
      }}
    >
      {(["ebook", "print"] as const).map((type) => {
        const d = drafts[type];
        const existing = book.formats.find((f) => f.type === type);
        return (
          <fieldset key={type} className="flex flex-col gap-5 rounded-2xl border border-border p-4 sm:p-5">
            <legend className="sr-only">{type === "ebook" ? "Ebook" : "Print"}</legend>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <Switch
                checked={d.active}
                onCheckedChange={(active) => patch(type, { active })}
                label={type === "ebook" ? "Sell as an ebook (PDF)" : "Sell in print"}
                description={type === "ebook" ? "Instant access after payment: read online or download." : "Shipped from your stock; shipping is charged at checkout."}
              />
              {existing && (
                <Badge size="sm" className="font-mono">
                  {existing.sku}
                </Badge>
              )}
            </div>
            {d.active && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {CURRENCIES.map((currency) => (
                    <FormField key={currency} label={`Price · ${currency}`} hint={CURRENCY_LABEL[currency]}>
                      <MoneyInput
                        currency={currency}
                        value={d.prices[currency]}
                        onChange={(amount) => patch(type, { prices: { ...d.prices, [currency]: amount } })}
                        onValidityChange={(valid) => markValidity(`${type}-price-${currency}`, valid)}
                      />
                    </FormField>
                  ))}
                </div>
                <Switch
                  checked={d.onSale}
                  onCheckedChange={(onSale) => patch(type, { onSale })}
                  label="Show a sale price"
                  description='Readers see the "was" price struck through next to the price.'
                />
                {d.onSale && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {CURRENCIES.map((currency) => (
                      <FormField
                        key={currency}
                        label={`Was · ${currency}`}
                        hint={d.prices[currency] !== null ? `Now ${formatMoney({ amount: d.prices[currency]!, currency })}` : "Set the price first"}
                      >
                        <MoneyInput
                          currency={currency}
                          value={d.compareAt[currency]}
                          onChange={(amount) => patch(type, { compareAt: { ...d.compareAt, [currency]: amount } })}
                          onValidityChange={(valid) => markValidity(`${type}-was-${currency}`, valid)}
                        />
                      </FormField>
                    ))}
                  </div>
                )}
                {type === "ebook" ? (
                  <Switch
                    checked={d.stampWithBuyer}
                    onCheckedChange={(stampWithBuyer) => patch(type, { stampWithBuyer })}
                    label="Personalise each copy"
                    description="Each page footer reads “Licensed to” the buyer's name and email, with the order number. Discourages sharing without DRM."
                  />
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <FormField label="Copies in stock" hint={existing?.print?.stockReserved ? `${existing.print.stockReserved} held by unpaid orders` : undefined}>
                      <Input inputMode="numeric" value={d.stockOnHand} onChange={(e) => patch(type, { stockOnHand: e.target.value })} />
                    </FormField>
                    <FormField label="Weight (grams)" hint="For shipping costs.">
                      <Input inputMode="numeric" value={d.weightGrams} onChange={(e) => patch(type, { weightGrams: e.target.value })} />
                    </FormField>
                    <FormField label="Most per order">
                      <Input inputMode="numeric" value={d.maxPerOrder} onChange={(e) => patch(type, { maxPerOrder: e.target.value })} />
                    </FormField>
                  </div>
                )}
              </>
            )}
          </fieldset>
        );
      })}
      {dirty && problems.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm text-danger" role="status">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </EditorSection>
  );
}
