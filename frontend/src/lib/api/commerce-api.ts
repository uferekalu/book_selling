import type { FormatType } from "@/lib/catalog-types";
import type { Currency } from "@/lib/money";
import { api } from "./api";

// Shapes of /cart, /checkout, /orders and /admin commerce routes (backend/src/commerce).

export type LineStatus = "ok" | "unavailable" | "no_price" | "owned" | "out_of_stock" | "over_stock";

export interface QuoteLine {
  bookId: string;
  format: FormatType;
  slug: string;
  title: string;
  cover: string | null;
  sku: string | null;
  unitAmount: number | null;
  compareAt: number | null;
  quantity: number;
  lineTotal: number;
  maxQuantity: number;
  status: LineStatus;
  message: string | null;
}

export interface CartLine extends QuoteLine {
  priceWas: number | null;
}

export interface CartView {
  currency: Currency;
  lines: CartLine[];
  subtotal: number;
  itemCount: number;
  problems: string[];
}

export interface Quote {
  currency: Currency;
  lines: QuoteLine[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  requiresShipping: boolean;
  shipping: {
    country: string | null;
    zoneId: string | null;
    zoneName: string | null;
    estimatedDays: { min: number; max: number } | null;
    available: boolean;
  };
  coupon: { code: string; applied: boolean; message: string | null } | null;
  problems: string[];
}

export interface ShippingAddressInput {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country: string;
}

export type OrderStatus = "pending_payment" | "paid" | "fulfilled" | "expired" | "cancelled" | "partially_refunded" | "refunded";

export interface OrderView {
  orderNumber: string;
  status: OrderStatus;
  awaitingPayment: boolean;
  createdAt: string;
  expiresAt: string | null;
  email: string;
  customerName: string;
  currency: Currency;
  items: Array<{
    bookId: string;
    slug: string;
    title: string;
    cover: string | null;
    format: FormatType;
    unitAmount: number;
    quantity: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  total: number;
  refundedTotal: number;
  coupon: { code: string } | null;
  shippingAddress: (ShippingAddressInput & { line2: string; state: string; postalCode: string }) | null;
  shippingEstimate: { min: number; max: number } | null;
  shipment: {
    status: "not_required" | "pending" | "processing" | "shipped" | "delivered";
    carrier: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    shippedAt: string | null;
    deliveredAt: string | null;
  };
  paidAt: string | null;
  returnPath: string | null;
  history: Array<{ status: OrderStatus; at: string }>;
}

export interface PlaceOrderInput {
  checkoutKey: string;
  currency: Currency;
  email?: string;
  name?: string;
  shippingAddress?: ShippingAddressInput;
  couponCode?: string;
  returnPath?: string;
  acceptTerms: boolean;
}

export interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  rates: Array<{ currency: Currency; firstItem: number; additionalItem: number }>;
  estimatedDays: { min: number; max: number };
  active: boolean;
}

export type ShippingZoneInput = Omit<ShippingZone, "id">;

type CartLineKey = { bookId: string; format: FormatType; quantity: number; currency: Currency };

export const commerceApi = api.injectEndpoints({
  endpoints: (builder) => ({
    cart: builder.query<CartView, Currency>({
      query: (currency) => ({ url: "/cart", params: { currency } }),
      providesTags: ["Cart"],
    }),
    addToCart: builder.mutation<CartView, CartLineKey>({
      query: ({ currency, ...body }) => ({ url: "/cart/items", method: "POST", params: { currency }, body }),
      invalidatesTags: ["Cart"],
    }),
    updateCartItem: builder.mutation<CartView, CartLineKey>({
      query: ({ currency, ...body }) => ({ url: "/cart/items", method: "PATCH", params: { currency }, body }),
      invalidatesTags: ["Cart"],
    }),
    removeCartItem: builder.mutation<CartView, Omit<CartLineKey, "quantity">>({
      query: ({ currency, bookId, format }) => ({ url: `/cart/items/${bookId}/${format}`, method: "DELETE", params: { currency } }),
      invalidatesTags: ["Cart"],
    }),
    quote: builder.mutation<Quote, { currency: Currency; shippingCountry?: string; couponCode?: string; email?: string }>({
      query: (body) => ({ url: "/checkout/quote", method: "POST", body }),
    }),
    placeOrder: builder.mutation<OrderView, PlaceOrderInput>({
      query: ({ checkoutKey, ...body }) => ({
        url: "/orders",
        method: "POST",
        headers: { "Idempotency-Key": checkoutKey },
        body,
      }),
      invalidatesTags: ["Orders"],
    }),
    myOrders: builder.query<OrderView[], void>({
      query: () => "/orders",
      providesTags: ["Orders"],
    }),
    order: builder.query<OrderView, string>({
      query: (orderNumber) => `/orders/${orderNumber}`,
      providesTags: (_r, _e, orderNumber) => [{ type: "Orders", id: orderNumber }],
    }),
    cancelOrder: builder.mutation<OrderView, string>({
      query: (orderNumber) => ({ url: `/orders/${orderNumber}/cancel`, method: "POST" }),
      invalidatesTags: ["Orders", "Cart"],
    }),
    guestOrder: builder.mutation<OrderView, { orderNumber: string; checkoutKey: string }>({
      query: (body) => ({ url: "/guest-orders/lookup", method: "POST", body }),
    }),
    guestCancelOrder: builder.mutation<OrderView, { orderNumber: string; checkoutKey: string }>({
      query: (body) => ({ url: "/guest-orders/cancel", method: "POST", body }),
    }),

    adminShippingZones: builder.query<ShippingZone[], void>({
      query: () => "/admin/shipping-zones",
      providesTags: ["AdminShipping"],
    }),
    createShippingZone: builder.mutation<ShippingZone[], ShippingZoneInput>({
      query: (body) => ({ url: "/admin/shipping-zones", method: "POST", body }),
      invalidatesTags: ["AdminShipping"],
    }),
    updateShippingZone: builder.mutation<ShippingZone[], { id: string; zone: ShippingZoneInput }>({
      query: ({ id, zone }) => ({ url: `/admin/shipping-zones/${id}`, method: "PUT", body: zone }),
      invalidatesTags: ["AdminShipping"],
    }),
    deleteShippingZone: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/shipping-zones/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminShipping"],
    }),
    adminOrders: builder.query<OrderView[], { status?: string; q?: string }>({
      query: (params) => ({ url: "/admin/orders", params }),
      providesTags: ["AdminOrders"],
    }),
  }),
});

export const {
  useCartQuery,
  useAddToCartMutation,
  useUpdateCartItemMutation,
  useRemoveCartItemMutation,
  useQuoteMutation,
  usePlaceOrderMutation,
  useMyOrdersQuery,
  useOrderQuery,
  useCancelOrderMutation,
  useGuestOrderMutation,
  useGuestCancelOrderMutation,
  useAdminShippingZonesQuery,
  useCreateShippingZoneMutation,
  useUpdateShippingZoneMutation,
  useDeleteShippingZoneMutation,
  useAdminOrdersQuery,
} = commerceApi;
