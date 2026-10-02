import type { Currency } from "@/lib/money";
import type { FormatType, PublicAuthor, PublicCategory, PublicImage, TocEntry } from "@/lib/catalog-types";
import type { UploadTicket } from "@/lib/upload";
import { api } from "./api";

// Shapes of /admin/catalog/* (backend/src/catalog/admin-catalog.controller.ts).

export type BookStatus = "draft" | "published" | "archived";

export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Price {
  currency: Currency;
  amount: number;
}

export interface AdminFormat {
  type: FormatType;
  sku: string;
  active: boolean;
  prices: Price[];
  compareAtPrices: Price[];
  ebook: { stampWithBuyer: boolean } | null;
  print: { stockOnHand: number; stockReserved: number; weightGrams: number; maxPerOrder: number } | null;
}

export interface AdminBook {
  id: string;
  title: string;
  subtitle: string;
  slug: string;
  status: BookStatus;
  listedAt: string | null;
  featured: boolean;
  authorIds: string[];
  categoryIds: string[];
  descriptionMarkdown: string;
  abstractMarkdown: string;
  tableOfContents: TocEntry[];
  isbn13: string | null;
  edition: string;
  publicationDate: string | null;
  pageCount: number | null;
  language: string;
  tags: string[];
  seo: { title: string; description: string };
  cover: (PublicImage & { source: { width: number; height: number }; crop: Crop | null }) | null;
  gallery: Array<PublicImage & { publicId: string }>;
  manuscript: { pages: number; bytes: number; uploadedAt: string } | null;
  preview: AdminPreview;
  formats: AdminFormat[];
  publishProblems: string[];
  updatedAt: string;
}

export type PreviewStatus = "none" | "queued" | "building" | "ready" | "failed";

export interface PreviewSectionInput {
  label: string;
  fromPage: number;
  toPage: number;
}

export interface AdminPreview {
  enabled: boolean;
  status: PreviewStatus;
  sections: PreviewSectionInput[];
  pageOffset: number;
  pageCount: number;
  teasers: number;
  error: string | null;
  generatedAt: string | null;
  builtFromCurrentFile: boolean;
  maxPercent: number;
  maxPages: number | null;
}

export interface AdminBookRow {
  id: string;
  title: string;
  slug: string;
  status: BookStatus;
  cover: PublicImage | null;
  formats: FormatType[];
  problems: number;
  updatedAt: string;
}

export interface AdminBookList {
  items: AdminBookRow[];
  total: number;
  page: number;
  pageSize: number;
}

export type AdminAuthor = PublicAuthor & { bioMarkdown: string };
export type AdminCategory = PublicCategory & { sortOrder: number };

export interface BookUpdate {
  title?: string;
  subtitle?: string;
  slug?: string;
  authorIds?: string[];
  categoryIds?: string[];
  descriptionMarkdown?: string;
  abstractMarkdown?: string;
  tableOfContents?: Array<{ title: string; page?: number; children?: Array<{ title: string; page?: number }> }>;
  isbn13?: string | null;
  edition?: string;
  publicationDate?: string | null;
  pageCount?: number | null;
  language?: string;
  tags?: string[];
  seo?: { title?: string; description?: string };
  featured?: boolean;
}

export interface FormatInput {
  type: FormatType;
  active: boolean;
  prices: Price[];
  compareAtPrices?: Price[];
  ebook?: { stampWithBuyer: boolean };
  print?: { stockOnHand: number; weightGrams: number; maxPerOrder?: number };
}

export interface AuthorInput {
  name: string;
  title?: string;
  bioMarkdown?: string;
  affiliations?: string[];
  links?: Partial<Record<"website" | "linkedin" | "googleScholar" | "researchGate", string>>;
}

export interface CategoryInput {
  name: string;
  description?: string;
  sortOrder?: number;
}

/** Public images (Cloudinary). Book PDFs go to private storage in parts (lib/upload.ts). */
export type UploadKind = "cover" | "gallery" | "author-photo";

export interface ManuscriptUploadRef {
  key: string;
  uploadId: string;
}

export interface StartedManuscriptUpload extends ManuscriptUploadRef {
  partBytes: number;
  partCount: number;
  maxBytes: number;
}

const bookTags = (id: string) => [{ type: "AdminBook" as const, id }, "AdminBooks" as const];

export const catalogAdminApi = api.injectEndpoints({
  endpoints: (builder) => ({
    adminBooks: builder.query<AdminBookList, { q?: string; status?: BookStatus; page?: number }>({
      query: (params) => ({ url: "/admin/catalog/books", params }),
      providesTags: ["AdminBooks"],
    }),
    adminBook: builder.query<AdminBook, string>({
      query: (id) => `/admin/catalog/books/${id}`,
      providesTags: (_result, _error, id) => [{ type: "AdminBook", id }],
    }),
    createBook: builder.mutation<AdminBook, { title: string }>({
      query: (body) => ({ url: "/admin/catalog/books", method: "POST", body }),
      invalidatesTags: ["AdminBooks"],
    }),
    updateBook: builder.mutation<AdminBook, { id: string; changes: BookUpdate }>({
      query: ({ id, changes }) => ({ url: `/admin/catalog/books/${id}`, method: "PATCH", body: changes }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    setFormats: builder.mutation<AdminBook, { id: string; formats: FormatInput[] }>({
      query: ({ id, formats }) => ({ url: `/admin/catalog/books/${id}/formats`, method: "PUT", body: { formats } }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    attachCover: builder.mutation<AdminBook, { id: string; publicId: string; crop?: Crop; alt?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/books/${id}/cover`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    addGalleryImage: builder.mutation<AdminBook, { id: string; publicId: string; alt?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/books/${id}/gallery`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    removeGalleryImage: builder.mutation<AdminBook, { id: string; publicId: string }>({
      query: ({ id, publicId }) => ({ url: `/admin/catalog/books/${id}/gallery/${encodeURIComponent(publicId)}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    startManuscriptUpload: builder.mutation<StartedManuscriptUpload, { id: string; bytes: number }>({
      query: ({ id, bytes }) => ({ url: `/admin/catalog/books/${id}/manuscript-uploads`, method: "POST", body: { bytes } }),
    }),
    signManuscriptParts: builder.mutation<
      { parts: Array<{ partNumber: number; url: string }> },
      ManuscriptUploadRef & { id: string; partNumbers: number[] }
    >({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/books/${id}/manuscript-uploads/parts`, method: "POST", body }),
    }),
    completeManuscriptUpload: builder.mutation<{ key: string }, ManuscriptUploadRef & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/books/${id}/manuscript-uploads/complete`, method: "POST", body }),
    }),
    abortManuscriptUpload: builder.mutation<void, ManuscriptUploadRef & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/books/${id}/manuscript-uploads/abort`, method: "POST", body }),
    }),
    /** The server reads the finished upload, checks it and makes it the book's file. */
    attachManuscript: builder.mutation<AdminBook, { id: string; key: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/books/${id}/manuscript`, method: "POST", body }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    bookStatus: builder.mutation<AdminBook, { id: string; action: "publish" | "unpublish" | "archive" }>({
      query: ({ id, action }) => ({ url: `/admin/catalog/books/${id}/${action}`, method: "POST" }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    deleteBook: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/catalog/books/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminBooks"],
    }),
    setPreview: builder.mutation<AdminBook, { id: string; sections: PreviewSectionInput[]; pageOffset: number }>({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/books/${id}/preview`, method: "PUT", body }),
      invalidatesTags: (_r, _e, { id }) => bookTags(id),
    }),
    rebuildPreview: builder.mutation<AdminBook, string>({
      query: (id) => ({ url: `/admin/catalog/books/${id}/preview/rebuild`, method: "POST" }),
      invalidatesTags: (_r, _e, id) => bookTags(id),
    }),
    /** A 30-minute private link to the book file, for page thumbnails in the preview picker. */
    manuscriptLink: builder.query<{ url: string; expiresAt: string }, { id: string; uploadedAt: string }>({
      query: ({ id }) => `/admin/catalog/books/${id}/manuscript-link`,
      keepUnusedDataFor: 0,
    }),
    markdownPreview: builder.mutation<{ html: string }, string>({
      query: (markdown) => ({ url: "/admin/catalog/markdown-preview", method: "POST", body: { markdown } }),
    }),

    adminAuthors: builder.query<AdminAuthor[], void>({
      query: () => "/admin/catalog/authors",
      providesTags: ["AdminAuthors"],
    }),
    createAuthor: builder.mutation<AdminAuthor, AuthorInput>({
      query: (body) => ({ url: "/admin/catalog/authors", method: "POST", body }),
      invalidatesTags: ["AdminAuthors"],
    }),
    updateAuthor: builder.mutation<AdminAuthor, { id: string; author: AuthorInput }>({
      query: ({ id, author }) => ({ url: `/admin/catalog/authors/${id}`, method: "PUT", body: author }),
      invalidatesTags: ["AdminAuthors"],
    }),
    authorPhoto: builder.mutation<AdminAuthor, { id: string; publicId: string; crop?: Crop }>({
      query: ({ id, ...body }) => ({ url: `/admin/catalog/authors/${id}/photo`, method: "POST", body }),
      invalidatesTags: ["AdminAuthors"],
    }),
    deleteAuthor: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/catalog/authors/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminAuthors"],
    }),

    adminCategories: builder.query<AdminCategory[], void>({
      query: () => "/admin/catalog/categories",
      providesTags: ["AdminCategories"],
    }),
    createCategory: builder.mutation<AdminCategory, CategoryInput>({
      query: (body) => ({ url: "/admin/catalog/categories", method: "POST", body }),
      invalidatesTags: ["AdminCategories"],
    }),
    updateCategory: builder.mutation<AdminCategory, { id: string; category: CategoryInput }>({
      query: ({ id, category }) => ({ url: `/admin/catalog/categories/${id}`, method: "PUT", body: category }),
      invalidatesTags: ["AdminCategories"],
    }),
    deleteCategory: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/catalog/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminCategories"],
    }),

    uploadSignature: builder.mutation<UploadTicket, { kind: UploadKind; ownerId: string }>({
      query: (body) => ({ url: "/uploads/signature", method: "POST", body }),
    }),
  }),
});

export const {
  useAdminBooksQuery,
  useAdminBookQuery,
  useCreateBookMutation,
  useUpdateBookMutation,
  useSetFormatsMutation,
  useAttachCoverMutation,
  useAddGalleryImageMutation,
  useRemoveGalleryImageMutation,
  useStartManuscriptUploadMutation,
  useSignManuscriptPartsMutation,
  useCompleteManuscriptUploadMutation,
  useAbortManuscriptUploadMutation,
  useAttachManuscriptMutation,
  useBookStatusMutation,
  useDeleteBookMutation,
  useMarkdownPreviewMutation,
  useSetPreviewMutation,
  useRebuildPreviewMutation,
  useManuscriptLinkQuery,
  useAdminAuthorsQuery,
  useCreateAuthorMutation,
  useUpdateAuthorMutation,
  useAuthorPhotoMutation,
  useDeleteAuthorMutation,
  useAdminCategoriesQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useDeleteCategoryMutation,
  useUploadSignatureMutation,
} = catalogAdminApi;
