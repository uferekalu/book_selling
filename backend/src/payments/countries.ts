const NAMES = new Intl.DisplayNames(['en'], { type: 'region' });

/** "NG" → "Nigeria" for emails; falls back to the code itself. */
export function countryName(code: string): string {
  try {
    return NAMES.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
