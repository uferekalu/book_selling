/** WCAG 2.x relative luminance / contrast ratio for `#rrggbb` colours. */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) throw new Error(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Reads the semantic palette for one theme out of tokens.css: light values are the
 * `--color-<name>: #hex` declarations, dark values the `--dark-<name>: #hex` declarations.
 */
export function readPalette(css: string, theme: "light" | "dark"): Record<string, string> {
  const prefix = theme === "light" ? "--color-" : "--dark-";
  const palette: Record<string, string> = {};
  const pattern = new RegExp(`${prefix}([a-z0-9-]+):\\s*(#[0-9a-fA-F]{6})\\s*;`, "g");
  for (const [, name, value] of css.matchAll(pattern)) palette[name] = value;
  return palette;
}
