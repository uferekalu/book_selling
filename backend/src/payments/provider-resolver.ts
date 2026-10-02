import type { Currency } from '../common/money/currency.js';
import type { Provider } from './schemas/payment.schema.js';

/**
 * Which providers can take each currency, best first (ARCHITECTURE §9.2). The first ENABLED one
 * is preselected; the buyer may pick any other enabled one. A provider is enabled when its keys
 * are configured, so launching without Stripe is just leaving Stripe's keys empty. Stripe never
 * takes naira (BS-22).
 */
export const ROUTING: Record<Currency, Provider[]> = {
  NGN: ['paystack', 'flutterwave'],
  USD: ['stripe', 'flutterwave', 'paystack'],
  GBP: ['stripe', 'flutterwave'],
  EUR: ['stripe', 'flutterwave'],
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  stripe: 'Stripe',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
};

/** Where the buyer is (their country at checkout) and where Stripe may be used. */
export interface BuyerLocation {
  country: string | null;
  stripeCountries: ReadonlySet<string>;
}

/**
 * The providers a buyer may use. Stripe is offered only to buyers in a country on the owner's
 * `STRIPE_COUNTRIES` list (where the business meets Stripe's and local requirements); an unknown
 * country never gets Stripe.
 */
export function providersFor(
  currency: Currency,
  enabled: ReadonlySet<Provider>,
  location: BuyerLocation,
): Provider[] {
  return ROUTING[currency].filter(
    (provider) =>
      enabled.has(provider) &&
      (provider !== 'stripe' ||
        (location.country !== null &&
          location.stripeCountries.has(location.country))),
  );
}

/** "US, gb ,IE" → {US, GB, IE}. */
export function parseCountryList(
  value: string | undefined | null,
): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter((code) => /^[A-Z]{2}$/.test(code)),
  );
}
