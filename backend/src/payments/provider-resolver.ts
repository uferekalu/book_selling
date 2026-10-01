import type { Currency } from '../common/money/currency.js';
import type { Provider } from './schemas/payment.schema.js';

/**
 * Which providers can take each currency, best first (ARCHITECTURE §9.2). The first ENABLED one
 * is preselected; the buyer may pick any other enabled one. A provider is enabled when its keys
 * are configured, so launching without Stripe is just leaving Stripe's keys empty.
 */
export const ROUTING: Record<Currency, Provider[]> = {
  NGN: ['paystack', 'flutterwave', 'stripe'],
  USD: ['stripe', 'flutterwave', 'paystack'],
  GBP: ['stripe', 'flutterwave'],
  EUR: ['stripe', 'flutterwave'],
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  stripe: 'Stripe',
  paystack: 'Paystack',
  flutterwave: 'Flutterwave',
};

export function providersFor(
  currency: Currency,
  enabled: ReadonlySet<Provider>,
): Provider[] {
  return ROUTING[currency].filter((provider) => enabled.has(provider));
}
