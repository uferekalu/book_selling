import { parseCountryList, providersFor } from './provider-resolver.js';

const all = new Set(['paystack', 'flutterwave', 'stripe'] as const);
const allowed = parseCountryList('US,GB,IE');

describe('providersFor (which payment providers a buyer may use)', () => {
  it('never offers Stripe for naira, whatever the country', () => {
    expect(
      providersFor('NGN', all, { country: 'US', stripeCountries: allowed }),
    ).toEqual(['paystack', 'flutterwave']);
  });

  it('offers Stripe first for USD, GBP and EUR only in allowed countries', () => {
    expect(
      providersFor('USD', all, { country: 'US', stripeCountries: allowed })[0],
    ).toBe('stripe');
    expect(
      providersFor('GBP', all, { country: 'GB', stripeCountries: allowed }),
    ).toEqual(['stripe', 'flutterwave']);
    expect(
      providersFor('EUR', all, { country: 'IE', stripeCountries: allowed }),
    ).toContain('stripe');
    expect(
      providersFor('USD', all, { country: 'NG', stripeCountries: allowed }),
    ).toEqual(['flutterwave', 'paystack']);
    expect(
      providersFor('EUR', all, { country: 'DE', stripeCountries: allowed }),
    ).toEqual(['flutterwave']);
  });

  it('gives an unknown country no Stripe, and an empty list Stripe nowhere', () => {
    expect(
      providersFor('USD', all, { country: null, stripeCountries: allowed }),
    ).not.toContain('stripe');
    expect(
      providersFor('USD', all, { country: 'US', stripeCountries: new Set() }),
    ).not.toContain('stripe');
  });

  it('offers only providers whose keys are set', () => {
    expect(
      providersFor('USD', new Set(['paystack'] as const), {
        country: 'US',
        stripeCountries: allowed,
      }),
    ).toEqual(['paystack']);
  });

  it('reads a country list forgivingly', () => {
    expect([...parseCountryList(' us, gb ,IE,,x1 ')]).toEqual([
      'US',
      'GB',
      'IE',
    ]);
    expect(parseCountryList(undefined).size).toBe(0);
  });
});
