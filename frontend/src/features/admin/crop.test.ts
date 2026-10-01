import { describe, expect, it } from "vitest";
import { CENTRED, coverSizeProblem, cropRect, fullCrop, maxZoom } from "./crop";

const isTwoByThree = (r: { width: number; height: number }) => Math.abs(r.width / r.height - 2 / 3) <= 0.02;

describe("cover crop", () => {
  it("uses the full height of a wide image and the full width of a tall one", () => {
    expect(fullCrop(3000, 2000)).toEqual({ width: 1333, height: 2000 });
    expect(fullCrop(1600, 3000)).toEqual({ width: 1600, height: 2400 });
    expect(fullCrop(1200, 1800)).toEqual({ width: 1200, height: 1800 });
  });

  it("centres the crop by default", () => {
    expect(cropRect(3000, 2000, CENTRED)).toEqual({ x: 834, y: 0, width: 1333, height: 2000 });
  });

  it("moves to the edges at focus 0 and 1 without leaving the image", () => {
    const left = cropRect(3000, 2000, { zoom: 1, focusX: 0, focusY: 0.5 });
    const right = cropRect(3000, 2000, { zoom: 1, focusX: 1, focusY: 0.5 });
    expect(left.x).toBe(0);
    expect(right.x + right.width).toBe(3000);
  });

  it("stays 2:3 and inside the image for many sizes, zooms and positions", () => {
    for (const [w, h] of [
      [1200, 1800],
      [4000, 3000],
      [2000, 6000],
      [2481, 3508],
      [5000, 5000],
    ]) {
      for (const zoom of [1, 1.3, 2, 9]) {
        for (const focus of [0, 0.37, 1]) {
          const r = cropRect(w, h, { zoom, focusX: focus, focusY: 1 - focus });
          expect(isTwoByThree(r)).toBe(true);
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.width).toBeLessThanOrEqual(w);
          expect(r.y + r.height).toBeLessThanOrEqual(h);
        }
      }
    }
  });

  it("never zooms below the minimum cover width", () => {
    expect(maxZoom(1200, 1800)).toBe(1);
    expect(maxZoom(2400, 3600)).toBe(2);
    expect(cropRect(2400, 3600, { zoom: 10, focusX: 0.5, focusY: 0.5 }).width).toBe(1200);
  });

  it("explains when an image is too small", () => {
    expect(coverSizeProblem(1200, 1800)).toBeNull();
    expect(coverSizeProblem(800, 1200)).toMatch(/800×1200px.*1200×1800px/);
    // Wide enough in pixels overall, but not once cut to 2:3.
    expect(coverSizeProblem(3000, 1500)).toMatch(/at least/);
  });
});
