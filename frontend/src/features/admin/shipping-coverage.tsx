"use client";

import NextLink from "next/link";
import { Alert } from "@/components/ui";
import { useAdminShippingZonesQuery, type ShippingZone } from "@/lib/api/commerce-api";
import { CURRENCIES } from "@/lib/money";

const REST = "*";

/**
 * Why some buyers can't order print copies, from the shipping zones (BS-31: the live store had
 * none, so every print order was refused). Empty when every country and currency is covered.
 */
export function shippingGaps(zones: ShippingZone[]): string[] {
  const active = zones.filter((z) => z.active);
  if (!active.length) return ["No active shipping zone: print copies can't be ordered anywhere."];
  const gaps: string[] = [];
  if (!active.some((z) => z.countries.includes(REST))) {
    gaps.push("No “Rest of the world” zone: buyers in countries not listed in a zone can’t order print copies.");
  }
  for (const zone of active) {
    const missing = CURRENCIES.filter((c) => !zone.rates.some((r) => r.currency === c));
    if (missing.length) {
      gaps.push(`${zone.name} has no rate in ${missing.join(", ")}: buyers paying in ${missing.length > 1 ? "those currencies" : "that currency"} can’t order print copies there.`);
    }
  }
  return gaps;
}

/** A warning wherever the owner manages print books, until shipping covers every buyer. */
export function ShippingCoverageAlert({ linkToShipping = true }: { linkToShipping?: boolean }) {
  const { data } = useAdminShippingZonesQuery();
  if (!data) return null;
  const gaps = shippingGaps(data);
  if (!gaps.length) return null;
  return (
    <Alert tone="warning" title="Some buyers can’t order print copies">
      <ul className="list-disc pl-5">
        {gaps.map((gap) => (
          <li key={gap}>{gap}</li>
        ))}
      </ul>
      {linkToShipping && (
        <NextLink href="/admin/shipping" className="mt-2 inline-block font-medium text-text underline underline-offset-4">
          Set up shipping
        </NextLink>
      )}
    </Alert>
  );
}
