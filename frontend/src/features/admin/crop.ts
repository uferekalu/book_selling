/** Cover crop maths for the editor. Covers are always 2:3 (width:height), like a printed book. */

export const COVER_RATIO = 2 / 3;
/** Matches the API's cover rule (backend/src/uploads/cloudinary.service.ts). */
export const COVER_MIN = { width: 1200, height: 1800 };

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropState {
  /** 1 = the largest 2:3 area that fits; higher zooms in. */
  zoom: number;
  /** Where the crop sits within the free space, 0–1 on each axis (0.5 = centred). */
  focusX: number;
  focusY: number;
}

export const CENTRED: CropState = { zoom: 1, focusX: 0.5, focusY: 0.5 };

/** The largest 2:3 rectangle that fits the source. */
export function fullCrop(width: number, height: number): { width: number; height: number } {
  if (width / height > COVER_RATIO) return { width: Math.round(height * COVER_RATIO), height };
  // Here width × 1.5 ≤ height, so the rounded height still fits.
  return { width, height: Math.round(width / COVER_RATIO) };
}

/** Highest zoom that still keeps the crop at least COVER_MIN wide (never below 1). */
export function maxZoom(width: number, height: number): number {
  const full = fullCrop(width, height);
  return Math.max(1, Math.min(4, full.width / COVER_MIN.width));
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Integer crop rectangle in source pixels, always inside the image and 2:3 (±1px rounding). */
export function cropRect(width: number, height: number, state: CropState): CropRect {
  const full = fullCrop(width, height);
  const zoom = clamp(state.zoom, 1, maxZoom(width, height));
  const cropWidth = Math.max(1, Math.round(full.width / zoom));
  const cropHeight = Math.min(height, Math.max(1, Math.round(cropWidth / COVER_RATIO)));
  return {
    x: Math.round((width - cropWidth) * clamp(state.focusX, 0, 1)),
    y: Math.round((height - cropHeight) * clamp(state.focusY, 0, 1)),
    width: cropWidth,
    height: cropHeight,
  };
}

/** Whether a source image is big enough to be a cover, with a message if not. */
export function coverSizeProblem(width: number, height: number): string | null {
  const full = fullCrop(width, height);
  if (full.width < COVER_MIN.width || full.height < COVER_MIN.height) {
    return `This image is ${width}×${height}px. Covers need at least ${COVER_MIN.width}×${COVER_MIN.height}px in a 2:3 shape so they stay sharp on large screens.`;
  }
  return null;
}

/** Reads an image file's pixel size in the browser before anything is uploaded. */
export function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("That file could not be read as an image."));
    image.src = url;
  });
}
