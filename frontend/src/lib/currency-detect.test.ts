import { describe, expect, it } from "vitest";
import { countryFromLanguage, currencyForCountry, resolveCurrency } from "./currency-detect";

describe("currency detection", () => {
  it.each([
    ["NG", "NGN"],
    ["gb", "GBP"],
    ["DE", "EUR"],
    ["IE", "EUR"],
    ["US", "USD"],
    ["GH", "USD"],
    [null, "USD"],
  ])("%s → %s", (country, currency) => {
    expect(currencyForCountry(country)).toBe(currency);
  });

  it("reads a country from Accept-Language", () => {
    expect(countryFromLanguage("en-NG,en;q=0.9")).toBe("NG");
    expect(countryFromLanguage("fr-fr")).toBe("FR");
    expect(countryFromLanguage("en")).toBeNull();
  });

  it("prefers the saved choice, then geo, then language", () => {
    expect(resolveCurrency({ cookie: "GBP", country: "NG" })).toBe("GBP");
    expect(resolveCurrency({ cookie: "JPY", country: "NG" })).toBe("NGN");
    expect(resolveCurrency({ acceptLanguage: "en-GB,en" })).toBe("GBP");
    expect(resolveCurrency({})).toBe("USD");
  });
});
