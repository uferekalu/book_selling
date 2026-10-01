"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import NextLink from "next/link";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert, Checkbox, FormField, Input, Select, Skeleton, Switch, Textarea, useToast } from "@/components/ui";
import { useAdminAuthorsQuery, useAdminCategoriesQuery, useUpdateBookMutation, type AdminBook, type BookUpdate } from "@/lib/api/catalog-admin-api";
import { errorMessage } from "@/lib/api/errors";
import { useReportDirty } from "./dirty";
import { EditorSection } from "./section";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "ha", label: "Hausa" },
  { value: "ig", label: "Igbo" },
  { value: "yo", label: "Yoruba" },
];

/** ISBN-13 check digit, same rule as the API's normaliseIsbn13. */
export function isValidIsbn13(input: string): boolean {
  const digits = input.replace(/[\s-]/g, "");
  if (!/^97[89]\d{10}$/.test(digits)) return false;
  const sum = digits
    .slice(0, 12)
    .split("")
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === Number(digits[12]);
}

export const detailsSchema = z.object({
  title: z.string().trim().min(1, "Enter the title").max(200, "Use at most 200 characters"),
  subtitle: z.string().trim().max(240, "Use at most 240 characters"),
  slug: z
    .string()
    .trim()
    .min(1, "Enter the web address")
    .max(80, "Use at most 80 characters")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens"),
  authorIds: z.array(z.string()).max(5, "Choose at most 5 authors"),
  categoryIds: z.array(z.string()).max(6, "Choose at most 6 subjects"),
  isbn13: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidIsbn13(v), "That isn't a valid ISBN-13 (check the digits)"),
  edition: z.string().trim().max(40, "Use at most 40 characters"),
  publicationDate: z.string(),
  pageCount: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 5000), "Enter a page count between 1 and 5000"),
  language: z.string().regex(/^[a-z]{2}$/),
  tags: z.string().max(1000),
  featured: z.boolean(),
  seoTitle: z.string().trim().max(70, "Use at most 70 characters"),
  seoDescription: z.string().trim().max(170, "Use at most 170 characters"),
});
export type DetailsValues = z.infer<typeof detailsSchema>;

export function detailsFromBook(book: AdminBook): DetailsValues {
  return {
    title: book.title,
    subtitle: book.subtitle,
    slug: book.slug,
    authorIds: book.authorIds,
    categoryIds: book.categoryIds,
    isbn13: book.isbn13 ?? "",
    edition: book.edition,
    publicationDate: book.publicationDate?.slice(0, 10) ?? "",
    pageCount: book.pageCount ? String(book.pageCount) : "",
    language: book.language || "en",
    tags: book.tags.join(", "),
    featured: book.featured,
    seoTitle: book.seo.title,
    seoDescription: book.seo.description,
  };
}

export function detailsToUpdate(values: DetailsValues): BookUpdate {
  return {
    title: values.title.trim(),
    subtitle: values.subtitle.trim(),
    slug: values.slug.trim(),
    authorIds: values.authorIds,
    categoryIds: values.categoryIds,
    isbn13: values.isbn13.trim() ? values.isbn13.replace(/[\s-]/g, "") : null,
    edition: values.edition.trim(),
    publicationDate: values.publicationDate ? new Date(`${values.publicationDate}T00:00:00.000Z`).toISOString() : null,
    pageCount: values.pageCount.trim() ? Number(values.pageCount) : null,
    language: values.language,
    tags: [
      ...new Set(
        values.tags
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      ),
    ].slice(0, 20),
    featured: values.featured,
    seo: { title: values.seoTitle.trim(), description: values.seoDescription.trim() },
  };
}

function toggle(list: string[], id: string, on: boolean) {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
}

export function DetailsSection({ book }: { book: AdminBook }) {
  const [update, state] = useUpdateBookMutation();
  const authors = useAdminAuthorsQuery();
  const categories = useAdminCategoriesQuery();
  const { toast } = useToast();
  const form = useForm<DetailsValues>({ resolver: zodResolver(detailsSchema), defaultValues: detailsFromBook(book) });
  const { errors, isDirty } = form.formState;
  const slug = useWatch({ control: form.control, name: "slug" });
  useReportDirty("details", isDirty);

  // Pick up changes saved elsewhere (another section's save returns the whole book).
  useEffect(() => {
    if (!form.formState.isDirty) form.reset(detailsFromBook(book));
  }, [book, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const saved = await update({ id: book.id, changes: detailsToUpdate(values) }).unwrap();
      form.reset(detailsFromBook(saved));
      toast({ title: "Details saved", tone: "success" });
    } catch (error) {
      toast({ title: errorMessage(error), tone: "danger" });
    }
  });

  return (
    <EditorSection
      id="details"
      title="Details"
      description="What the book is called, who wrote it and how it is listed."
      dirty={isDirty}
      saving={state.isLoading}
      onReset={() => form.reset(detailsFromBook(book))}
      form="details-form"
    >
      <form id="details-form" onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-5">
        <FormField label="Title" required error={errors.title?.message}>
          <Input {...form.register("title")} maxLength={200} />
        </FormField>
        <FormField label="Subtitle" error={errors.subtitle?.message}>
          <Input {...form.register("subtitle")} maxLength={240} />
        </FormField>
        <FormField
          label="Web address"
          error={errors.slug?.message}
          hint={
            book.status === "draft" && !book.listedAt
              ? `The book's link: /books/${slug || "…"}`
              : `The book's link: /books/${slug || "…"}. Changing it keeps the old link working (it redirects).`
          }
        >
          <Input {...form.register("slug")} autoCapitalize="none" spellCheck={false} maxLength={80} />
        </FormField>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium text-text">Authors</legend>
          {authors.isLoading ? (
            <Skeleton className="h-11 w-full" />
          ) : authors.data?.length ? (
            <Controller
              control={form.control}
              name="authorIds"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {authors.data!.map((author) => (
                    <Checkbox
                      key={author.id}
                      label={author.name}
                      description={author.title || undefined}
                      checked={field.value.includes(author.id)}
                      onChange={(event) => field.onChange(toggle(field.value, author.id, event.target.checked))}
                    />
                  ))}
                </div>
              )}
            />
          ) : (
            <Alert tone="info">
              No authors yet.{" "}
              <NextLink href="/admin/authors" className="font-medium underline underline-offset-4">
                Add the author profile
              </NextLink>{" "}
              first, then choose it here.
            </Alert>
          )}
          {errors.authorIds && <p className="text-sm text-danger">{errors.authorIds.message}</p>}
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium text-text">Subjects</legend>
          {categories.isLoading ? (
            <Skeleton className="h-11 w-full" />
          ) : categories.data?.length ? (
            <Controller
              control={form.control}
              name="categoryIds"
              render={({ field }) => (
                <div className="grid gap-2 sm:grid-cols-2">
                  {categories.data!.map((category) => (
                    <Checkbox
                      key={category.id}
                      label={category.name}
                      checked={field.value.includes(category.id)}
                      onChange={(event) => field.onChange(toggle(field.value, category.id, event.target.checked))}
                    />
                  ))}
                </div>
              )}
            />
          ) : (
            <p className="text-sm text-text-muted">
              No subjects yet.{" "}
              <NextLink href="/admin/categories" className="font-medium text-primary underline underline-offset-4">
                Add subjects
              </NextLink>{" "}
              such as &ldquo;Foundry technology&rdquo; or &ldquo;Heat treatment&rdquo;.
            </p>
          )}
          {errors.categoryIds && <p className="text-sm text-danger">{errors.categoryIds.message}</p>}
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="ISBN-13" error={errors.isbn13?.message} hint="Optional. Hyphens are fine.">
            <Input {...form.register("isbn13")} inputMode="numeric" placeholder="978-…" />
          </FormField>
          <FormField label="Edition" error={errors.edition?.message}>
            <Input {...form.register("edition")} placeholder="e.g. 2nd edition" maxLength={40} />
          </FormField>
          <FormField label="Publication date" error={errors.publicationDate?.message}>
            <Input type="date" {...form.register("publicationDate")} />
          </FormField>
          <FormField label="Pages" error={errors.pageCount?.message}>
            <Input {...form.register("pageCount")} inputMode="numeric" />
          </FormField>
          <FormField label="Language">
            <Select options={LANGUAGES} {...form.register("language")} />
          </FormField>
          <FormField label="Keywords" hint="Comma-separated; help search find the book." error={errors.tags?.message}>
            <Input {...form.register("tags")} placeholder="casting, sand moulding, annealing" />
          </FormField>
        </div>

        <Controller
          control={form.control}
          name="featured"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={field.onChange}
              label="Feature on the home page"
              description="Featured books lead the home page and the default listing."
            />
          )}
        />

        <details className="group rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium text-text">Search engine listing (optional)</summary>
          <div className="mt-4 flex flex-col gap-5">
            <FormField label="Search title" hint="Defaults to the book title." error={errors.seoTitle?.message}>
              <Input {...form.register("seoTitle")} maxLength={70} />
            </FormField>
            <FormField label="Search description" hint="Defaults to the start of the abstract." error={errors.seoDescription?.message}>
              <Textarea rows={3} {...form.register("seoDescription")} maxLength={170} />
            </FormField>
          </div>
        </details>
      </form>
    </EditorSection>
  );
}
