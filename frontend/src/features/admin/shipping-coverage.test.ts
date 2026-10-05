import { describe, expect, it } from "vitest";
import type { ShippingZone } from "@/lib/api/commerce-api";
import { shippingGaps } from "./shipping-coverage";

const all = (["NGN", "USD", "GBP", "EUR"] as const).map((currency) => ({ currency, firstItem: 100, additionalItem: 50 }));
const zone = (over: Partial<ShippingZone>): ShippingZone => ({
  id: "z",
  name: "Nigeria",
  countries: ["NG"],
  rates: all,
  estimatedDays: { min: 2, max: 5 },
  active: true,
  ...over,
});

describe("shippingGaps", () => {
  it("no zones (or none active) blocks every print order", () => {
    expect(shippingGaps([])).toEqual(["No active shipping zone: print copies can't be ordered anywhere."]);
    expect(shippingGaps([zone({ active: false })])).toHaveLength(1);
  });

  it("flags a missing rest-of-world zone and missing currencies", () => {
    expect(shippingGaps([zone({ rates: all.slice(0, 2) })])).toEqual([
      "No “Rest of the world” zone: buyers in countries not listed in a zone can’t order print copies.",
      "Nigeria has no rate in GBP, EUR: buyers paying in those currencies can’t order print copies there.",
    ]);
  });

  it("is empty when every country and currency is covered", () => {
    expect(shippingGaps([zone({}), zone({ id: "w", name: "Rest of the world", countries: ["*"] })])).toEqual([]);
  });
});
