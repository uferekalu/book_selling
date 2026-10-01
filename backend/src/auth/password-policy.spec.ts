import { passwordProblem } from './password-policy.js';

describe('passwordProblem', () => {
  it('accepts a long, unpredictable passphrase', () => {
    expect(passwordProblem('correct horse battery staple')).toBeNull();
    expect(passwordProblem('Gear-ratio-47-lathe')).toBeNull();
  });

  it.each([
    ['short1', /at least 10/],
    ['password123', /too common/],
    ['Thermodynamics', /too common/],
    ['zzzzzzzzzzzz', /repeated/],
    ['x'.repeat(129), /at most 128/],
  ])('rejects %s', (password, message) => {
    expect(passwordProblem(password)).toMatch(message);
  });

  it('rejects passwords containing the email local part or the name', () => {
    expect(
      passwordProblem('adaokafor-2026!', { email: 'adaokafor@example.com' }),
    ).toMatch(/email/);
    expect(passwordProblem('i-am-okafor-now', { name: 'Ada Okafor' })).toMatch(
      /name/,
    );
  });
});
