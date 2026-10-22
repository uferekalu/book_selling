import { z } from "zod";
import type { AdminBook, BookUpdate } from "@/lib/api/catalog-admin-api";

/** The "Paper details" form (BS-34): where and how a paper was presented, and how it is offered. */
export const EVENT_TYPE_OPTIONS = [
  { value: "conference", label: "Conference" },
  { value: "workshop", label: "Workshop" },
  { value: "seminar", label: "Seminar" },
  { value: "journal", label: "Journal" },
  { value: "other", label: "Other" },
] as const;

const httpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
};

export const paperSchema = z
  .object({
    access: z.enum(["sale", "external"]),
    eventType: z.enum(["conference", "workshop", "seminar", "journal", "other"]),
    venue: z.string().trim().max(200, "Use at most 200 characters"),
    location: z.string().trim().max(120, "Use at most 120 characters"),
    publisher: z.string().trim().max(160, "Use at most 160 characters"),
    pages: z.string().trim().max(20, "Use at most 20 characters"),
    doi: z.string().trim().max(120, "Use at most 120 characters"),
    externalUrl: z
      .string()
      .trim()
      .max(500, "Use at most 500 characters")
      .refine((value) => !value || httpUrl(value), "Enter the full web address, starting with https://"),
  })
  .superRefine((values, ctx) => {
    if (values.access === "external" && !values.externalUrl) {
      ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "Enter the link to the paper on the publisher’s website" });
    }
  });

export type PaperValues = z.infer<typeof paperSchema>;

export function paperFromBook(book: Pick<AdminBook, "paper">): PaperValues {
  const paper = book.paper;
  return {
    access: paper?.access ?? "sale",
    eventType: paper?.eventType ?? "conference",
    venue: paper?.venue ?? "",
    location: paper?.location ?? "",
    publisher: paper?.publisher ?? "",
    pages: paper?.pages ?? "",
    doi: paper?.doi ?? "",
    externalUrl: paper?.externalUrl ?? "",
  };
}

/** The PATCH body: every field sent explicitly; an empty link is cleared. */
export function paperUpdate(values: PaperValues): BookUpdate {
  return {
    paper: {
      access: values.access,
      eventType: values.eventType,
      venue: values.venue.trim(),
      location: values.location.trim(),
      publisher: values.publisher.trim(),
      pages: values.pages.trim(),
      doi: values.doi.trim(),
      externalUrl: values.externalUrl.trim() || null,
    },
  };
}
