import type { BookCardData } from "@/lib/catalog-types";
import type { Currency } from "@/lib/money";
import { api } from "./api";

// Shapes of /catalog/books/:id/reviews, /reviews, /admin/reviews, /wishlist and /admin/coupons
// (backend/src/engagement and commerce, BS-11).

export interface PublicReview {
  id: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
  edited: boolean;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<"1" | "2" | "3" | "4" | "5", number>;
}

export interface MyReviewState {
  canReview: boolean;
  reason: "not_bought" | "staff" | null;
  review: (PublicReview & { status: "published" | "hidden" }) | null;
}

export interface AdminReview extends PublicReview {
  status: "published" | "hidden";
  hiddenReason: string | null;
  book: { id: string; title: string; slug: string } | null;
  reviewerEmail: string | null;
}

export interface CouponAmount {
  currency: Currency;
  amount: number;
}

export interface Coupon {
  id: string;
  code: string;
  description: string;
  kind: "percent" | "fixed";
  percentOff: number | null;
  amountsOff: CouponAmount[];
  minSubtotals: CouponAmount[];
  appliesTo: { bookIds: string[]; formats: Array<"ebook" | "print"> };
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  perCustomerLimit: number | null;
  redemptionCount: number;
  active: boolean;
}

export type CouponInput = Omit<Coupon, "id" | "redemptionCount" | "percentOff" | "startsAt" | "endsAt" | "maxRedemptions" | "perCustomerLimit"> & {
  percentOff?: number;
  startsAt?: string;
  endsAt?: string;
  maxRedemptions?: number;
  perCustomerLimit?: number;
};

export const engagementApi = api.injectEndpoints({
  endpoints: (builder) => ({
    bookReviews: builder.query<{ items: PublicReview[]; total: number; page: number; pageSize: number; summary: RatingSummary }, { bookId: string; page: number }>({
      query: ({ bookId, page }) => ({ url: `/catalog/books/${bookId}/reviews`, params: { page } }),
      providesTags: (_r, _e, { bookId }) => [{ type: "Reviews", id: bookId }],
    }),
    myReview: builder.query<MyReviewState, string>({
      query: (bookId) => `/reviews/books/${bookId}/mine`,
      providesTags: (_r, _e, bookId) => [{ type: "Reviews", id: bookId }],
    }),
    writeReview: builder.mutation<PublicReview, { bookId: string; rating: number; title: string; body: string }>({
      query: ({ bookId, ...body }) => ({ url: `/reviews/books/${bookId}`, method: "PUT", body }),
      invalidatesTags: (_r, _e, { bookId }) => [{ type: "Reviews", id: bookId }, "AdminReviews"],
    }),
    deleteReview: builder.mutation<void, string>({
      query: (bookId) => ({ url: `/reviews/books/${bookId}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, bookId) => [{ type: "Reviews", id: bookId }, "AdminReviews"],
    }),
    adminReviews: builder.query<{ items: AdminReview[]; total: number; page: number; pageSize: number }, { status: "all" | "published" | "hidden"; page: number }>({
      query: (params) => ({ url: "/admin/reviews", params }),
      providesTags: ["AdminReviews"],
    }),
    setReviewVisibility: builder.mutation<void, { id: string; status: "published" | "hidden"; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/admin/reviews/${id}/visibility`, method: "POST", body }),
      invalidatesTags: ["AdminReviews", "Reviews"],
    }),
    wishlistIds: builder.query<string[], void>({
      query: () => "/wishlist/ids",
      providesTags: ["Wishlist"],
    }),
    wishlist: builder.query<BookCardData[], Currency>({
      query: (currency) => ({ url: "/wishlist", params: { currency } }),
      providesTags: ["Wishlist"],
    }),
    addToWishlist: builder.mutation<string[], string>({
      query: (bookId) => ({ url: `/wishlist/${bookId}`, method: "PUT" }),
      invalidatesTags: ["Wishlist"],
    }),
    removeFromWishlist: builder.mutation<string[], string>({
      query: (bookId) => ({ url: `/wishlist/${bookId}`, method: "DELETE" }),
      invalidatesTags: ["Wishlist"],
    }),
    adminCoupons: builder.query<Coupon[], void>({
      query: () => "/admin/coupons",
      providesTags: ["AdminCoupons"],
    }),
    createCoupon: builder.mutation<Coupon[], CouponInput>({
      query: (body) => ({ url: "/admin/coupons", method: "POST", body }),
      invalidatesTags: ["AdminCoupons"],
    }),
    updateCoupon: builder.mutation<Coupon[], { id: string; input: CouponInput }>({
      query: ({ id, input }) => ({ url: `/admin/coupons/${id}`, method: "PUT", body: input }),
      invalidatesTags: ["AdminCoupons"],
    }),
  }),
});

export const {
  useBookReviewsQuery,
  useMyReviewQuery,
  useWriteReviewMutation,
  useDeleteReviewMutation,
  useAdminReviewsQuery,
  useSetReviewVisibilityMutation,
  useWishlistIdsQuery,
  useWishlistQuery,
  useAddToWishlistMutation,
  useRemoveFromWishlistMutation,
  useAdminCouponsQuery,
  useCreateCouponMutation,
  useUpdateCouponMutation,
} = engagementApi;
