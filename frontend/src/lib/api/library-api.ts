import type { PublicImage } from "@/lib/catalog-types";
import { api } from "./api";

// Shapes of /library (backend/src/library): the customer's ebooks (ARCHITECTURE §10.2–10.3).

export interface LibraryItem {
  bookId: string;
  slug: string;
  title: string;
  subtitle: string;
  authors: string[];
  cover: PublicImage | null;
  pages: number;
  grantedAt: string;
  orderNumber: string | null;
  /** The buyer's personal copy: being made, ready, or failed (the store was told). */
  copy: "ready" | "preparing" | "failed";
  /** A newer edition is being prepared; the current one is still readable. */
  updating: boolean;
  progress: { page: number; maxPage: number; updatedAt: string } | null;
}

export interface LibraryOutlineEntry {
  title: string;
  level: 1 | 2;
  /** PDF page, or null when the contents line has no page number. */
  page: number | null;
}

export type LibraryBook = LibraryItem & { outline: LibraryOutlineEntry[] };

export type FileLink = { status: "ready"; url: string; expiresAt: string; updating: boolean } | { status: "preparing" };

export const libraryApi = api.injectEndpoints({
  endpoints: (builder) => ({
    library: builder.query<LibraryItem[], void>({
      query: () => "/library",
      providesTags: ["Library"],
    }),
    libraryBook: builder.query<LibraryBook, string>({
      query: (bookId) => `/library/${bookId}`,
      providesTags: (_r, _e, bookId) => [{ type: "Library", id: bookId }],
    }),
    /** Books the signed-in customer owns: "In your library" and the full reader. */
    ownedBooks: builder.query<Array<{ bookId: string; slug: string }>, void>({
      query: () => "/library/owned",
      providesTags: ["Library"],
    }),
    readLink: builder.mutation<FileLink, string>({
      query: (bookId) => ({ url: `/library/${bookId}/read`, method: "POST" }),
    }),
    downloadLink: builder.mutation<FileLink, string>({
      query: (bookId) => ({ url: `/library/${bookId}/download`, method: "POST" }),
    }),
    saveProgress: builder.mutation<void, { bookId: string; page: number }>({
      query: ({ bookId, page }) => ({ url: `/library/${bookId}/progress`, method: "PUT", body: { page } }),
    }),
  }),
});

export const {
  useLibraryQuery,
  useLibraryBookQuery,
  useOwnedBooksQuery,
  useReadLinkMutation,
  useDownloadLinkMutation,
  useSaveProgressMutation,
} = libraryApi;
