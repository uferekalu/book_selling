import { cleanText, reviewerName, roundRating } from './reviews.service.js';

describe('review helpers', () => {
  it('shows the first name and last initial, never the full name', () => {
    expect(reviewerName('Ada Obi')).toBe('Ada O.');
    expect(reviewerName('  chidi   emeka  eze ')).toBe('chidi E.');
    expect(reviewerName('Fatima')).toBe('Fatima');
    expect(reviewerName('   ')).toBe('A reader');
  });

  it('keeps review text plain and tidy, within its limit', () => {
    expect(cleanText('  Great\r\n\r\n\r\n\r\nbook  ', 100)).toBe(
      'Great\n\nbook',
    );
    expect(cleanText(undefined, 10)).toBe('');
    expect(() => cleanText('x'.repeat(11), 10)).toThrow(/under 10 characters/);
  });

  it('rounds the average to one decimal place', () => {
    expect(roundRating(3.4567)).toBe(3.5);
    expect(roundRating(4)).toBe(4);
    expect(roundRating(11 / 3)).toBe(3.7);
  });
});
