import { describe, expect, it } from "vitest";
import { contrastRatio, readPalette, relativeLuminance } from "./contrast";

describe("contrast", () => {
  it("matches the WCAG reference values", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
    expect(relativeLuminance("#000000")).toBeCloseTo(0);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#6f4527", "#fdfbf8")).toBeCloseTo(contrastRatio("#fdfbf8", "#6f4527"));
  });

  it("rejects non-hex input", () => {
    expect(() => relativeLuminance("rgb(0 0 0)")).toThrow();
  });

  it("reads light and dark palettes separately", () => {
    const css = "--color-text: #111111; --dark-text: #eeeeee; --color-glass: rgb(0 0 0 / 0.5);";
    expect(readPalette(css, "light")).toEqual({ text: "#111111" });
    expect(readPalette(css, "dark")).toEqual({ text: "#eeeeee" });
  });
});
