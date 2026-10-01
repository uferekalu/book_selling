import {
  add,
  equals,
  max,
  min,
  money,
  MoneyError,
  multiply,
  percentOf,
  subtract,
  sum,
  toMajorString,
  zero,
} from './money.js';

const usd = (amount: number) => money(amount, 'USD');
const ngn = (amount: number) => money(amount, 'NGN');

describe('money', () => {
  it('adds, subtracts, multiplies and sums in minor units', () => {
    expect(add(usd(2999), usd(1))).toEqual(usd(3000));
    expect(subtract(usd(3000), usd(450))).toEqual(usd(2550));
    expect(multiply(usd(2999), 3)).toEqual(usd(8997));
    expect(sum([usd(1), usd(2), usd(3)], 'USD')).toEqual(usd(6));
    expect(sum([], 'NGN')).toEqual(zero('NGN'));
    expect(min(usd(5), usd(9))).toEqual(usd(5));
    expect(max(usd(5), usd(9))).toEqual(usd(9));
  });

  it('refuses to mix currencies', () => {
    expect(() => add(usd(1), ngn(1))).toThrow(MoneyError);
    expect(() => sum([usd(1), ngn(1)], 'USD')).toThrow(/Cannot combine/);
  });

  it('refuses floats, unsafe integers and bad quantities', () => {
    expect(() => usd(29.99)).toThrow(MoneyError);
    expect(() => usd(Number.MAX_SAFE_INTEGER + 2)).toThrow(MoneyError);
    expect(() => multiply(usd(100), 1.5)).toThrow(/Quantity/);
    expect(() => multiply(usd(100), -1)).toThrow(/Quantity/);
    expect(() => money(1, 'JPY' as never)).toThrow(/Unknown currency/);
  });

  it('takes a percentage once, rounding half-up to the minor unit', () => {
    expect(percentOf(usd(2999), 15)).toEqual(usd(450)); // 449.85 → 450
    expect(percentOf(usd(2990), 15)).toEqual(usd(449)); // 448.5 → 449 (half-up)
    expect(percentOf(usd(1), 49)).toEqual(usd(0)); // 0.49 → 0
    expect(percentOf(usd(1), 50)).toEqual(usd(1)); // 0.5 → 1
    expect(percentOf(ngn(2_500_000), 100)).toEqual(ngn(2_500_000));
    expect(() => percentOf(usd(100), 12.5)).toThrow(/Percent/);
    expect(() => percentOf(usd(100), 101)).toThrow(/Percent/);
  });

  it('writes major-unit strings for providers without float maths', () => {
    expect(toMajorString(usd(2999))).toBe('29.99');
    expect(toMajorString(usd(7))).toBe('0.07');
    expect(toMajorString(ngn(2_500_000))).toBe('25000.00');
    expect(toMajorString(usd(-150))).toBe('-1.50');
  });

  it('compares exactly', () => {
    expect(equals(usd(100), usd(100))).toBe(true);
    expect(equals(usd(100), ngn(100))).toBe(false);
  });
});
