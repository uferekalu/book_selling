"use client";

import type { ImageLoaderProps } from "next/image";

/**
 * next/image loader for Cloudinary (next.config.ts). The API sends delivery URLs that already
 * carry the cover's crop (`…/upload/c_crop,…/v12/id`); this inserts the size and format step
 * *after* the crop, so each device downloads exactly the pixels it shows, as AVIF or WebP where
 * supported (`f_auto`). Non-Cloudinary sources pass through untouched.
 */
export default function cloudinaryLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src.startsWith("https://res.cloudinary.com/")) return src;
  const step = `w_${width},c_limit,q_${quality ?? "auto"},f_auto,dpr_1`;
  return src.replace(/\/(v\d+\/)/, `/${step}/$1`);
}
