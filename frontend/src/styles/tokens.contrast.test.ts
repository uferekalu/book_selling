import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readPalette } from "./contrast";

const css = readFileSync(join(__dirname, "tokens.css"), "utf8");

// WCAG 2.2 AA: 4.5 for body text, 3 for large text and UI component boundaries (1.4.11).
const TEXT = 4.5;
const UI = 3;

/** [foreground, background, minimum ratio] — every pairing the UI kit actually renders. */
const PAIRS: Array<[string, string, number]> = [
  ...["background", "surface", "surface-raised", "surface-sunken", "secondary", "secondary-hover"].flatMap(
    (bg): Array<[string, string, number]> => [
      ["text", bg, TEXT],
      ["text-muted", bg, TEXT],
    ],
  ),
  ["text-subtle", "background", TEXT],
  ["text-subtle", "surface", TEXT],
  ["primary", "background", TEXT],
  ["primary", "surface", TEXT],
  ["primary", "surface-raised", TEXT],
  ["on-primary", "primary", TEXT],
  ["on-primary", "primary-hover", TEXT],
  ["on-primary", "primary-active", TEXT],
  ["on-primary-subtle", "primary-subtle", TEXT],
  ["on-accent", "accent", TEXT],
  ["on-accent", "accent-hover", TEXT],
  ["on-accent-subtle", "accent-subtle", TEXT],
  ...["success", "warning", "danger", "info"].flatMap((tone): Array<[string, string, number]> => [
    [`on-${tone}`, tone, TEXT],
    [tone, `${tone}-subtle`, TEXT],
    [tone, "surface", TEXT],
  ]),
  ["border-input", "surface", UI],
  ["border-input", "background", UI],
  ["focus-ring", "surface", UI],
  ["focus-ring", "background", UI],
  ["primary", "surface", UI],
];

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const palette = readPalette(css, theme);

  it.each(PAIRS)("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(palette[fg], `missing ${theme} token ${fg}`).toBeDefined();
    expect(palette[bg], `missing ${theme} token ${bg}`).toBeDefined();
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(min);
  });
});

describe("dark palette completeness", () => {
  it("defines a dark value for every themed semantic colour", () => {
    const light = readPalette(css, "light");
    const dark = readPalette(css, "dark");
    const rawScale = /^(brown|paper|gold)-\d+$/;
    const semantic = Object.keys(light).filter((name) => !rawScale.test(name));
    expect(semantic.filter((name) => !(name in dark))).toEqual([]);
  });

  it("activates every dark value in both the OS-preference and explicit blocks", () => {
    const dark = Object.keys(readPalette(css, "dark"));
    for (const name of dark) {
      const activation = `--color-${name}: var(--dark-${name});`;
      const occurrences = css.split(activation).length - 1;
      expect(occurrences, name).toBe(2);
    }
  });
});
