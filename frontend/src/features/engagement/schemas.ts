import { z } from "zod";

/** Mirrors backend REVIEW_BODY_MAX (engagement/schemas/review.schema.ts). */
export const REVIEW_BODY_MAX = 4000;

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose 1 to 5 stars").max(5, "Choose 1 to 5 stars"),
  title: z.string().trim().max(120, "Keep the title under 120 characters"),
  body: z.string().trim().max(REVIEW_BODY_MAX, `Keep the review under ${REVIEW_BODY_MAX.toLocaleString("en")} characters`),
});
export type ReviewValues = z.infer<typeof reviewSchema>;
