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
  /** The country the buyer is paying from (null on orders from before BS-22). */
  country: string | null;
  history: Array<{ status: OrderStatus; at: string }>;
}

export interface PlaceOrderInput {
  checkoutKey: string;
  currency: Currency;
  /** Where the buyer is paying from (ISO code); decides the payment options. */
  country: string;
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

export type Provider = "stripe" | "paystack" | "flutterwave";

export interface PaymentOptions {
  currency: Currency;
  providers: Array<{ id: Provider; label: string }>;
  default: Provider | null;
}

export interface PaymentVerification {
  status: "paid" | "pending" | "failed";
  orderNumber: string;
  orderStatus: OrderStatus;
  returnPath: string | null;
  provider: Provider;
}

export interface AdminPayment {
  reference: string;
  provider: Provider;
  status: "initiated" | "succeeded" | "failed" | "abandoned" | "partially_refunded" | "refunded";
  amount: number;
  currency: Currency;
  verifiedAmount: number | null;
  failureReason: string | null;
  reconciliationRequired: boolean;
  reconciliationReason: string | null;
  createdAt: string;
  succeededAt: string | null;
  refunds: Array<{
    refundId: string;
    amount: number;
    status: "pending" | "succeeded" | "failed" | "outcome_unknown";
    reason: string;
    requestedBy: string;
    createdAt: string;
    failureReason: string | null;
  }>;
}

/** What a buyer did with an order's ebooks, for refund decisions (PRODUCT_RULES §9). */
export interface EbookUsage {
  bookId: string;
  title: string;
  downloads: number;
  lastDownloadedAt: string | null;
  firstOpenedAt: string | null;
  furthestPage: number | null;
  previewEndsAt: number | null;
  readBeyondPreview: boolean;
  removed: boolean;
}

export type AdminOrderView = OrderView & {
  attention: { required: boolean; reason: string };
  /** Only on the single-order view. */
  ebookUsage?: EbookUsage[];
};

export type ShipmentStep = "processing" | "shipped" | "delivered";

export interface ShipmentUpdateInput {
  orderNumber: string;
  status: ShipmentStep;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
}

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

    paymentOptions: builder.query<PaymentOptions, { currency: Currency; country: string | null }>({
      query: ({ currency, country }) => ({ url: "/payments/options", params: { currency, ...(country ? { country } : {}) } }),
    }),
    initiatePayment: builder.mutation<{ redirectUrl: string; reference: string }, { orderNumber: string; provider: Provider; checkoutKey?: string }>({
      query: (body) => ({ url: "/payments/initiate", method: "POST", body }),
    }),
    /** Stops paying this order (the server first checks no earlier attempt went through). */
    releaseOrder: builder.mutation<OrderView, { orderNumber: string; checkoutKey?: string }>({
      query: (body) => ({ url: "/payments/release", method: "POST", body }),
      invalidatesTags: ["Orders", "Cart"],
    }),
    verifyPayment: builder.mutation<PaymentVerification, string>({
      query: (reference) => ({ url: "/payments/verify", method: "POST", body: { reference } }),
      // A paid ebook is now owned: the library and "In your library" refresh.
      invalidatesTags: ["Orders", "Cart", "Library"],
    }),
    adminOrder: builder.query<AdminOrderView, string>({
      query: (orderNumber) => `/admin/orders/${orderNumber}`,
      providesTags: (_r, _e, n) => [{ type: "AdminOrders", id: n }],
    }),
    adminOrderPayments: builder.query<AdminPayment[], string>({
      query: (orderNumber) => `/admin/orders/${orderNumber}/payments`,
      providesTags: (_r, _e, n) => [{ type: "AdminOrders", id: n }],
    }),
    refundOrder: builder.mutation<{ refundId: string; status: "succeeded" | "pending" | "outcome_unknown" }, { orderNumber: string; amount: number; reason: string }>({
      query: ({ orderNumber, ...body }) => ({ url: `/admin/orders/${orderNumber}/refunds`, method: "POST", body }),
      invalidatesTags: (_r, _e, { orderNumber }) => [{ type: "AdminOrders", id: orderNumber }, "AdminOrders"],
    }),
    /** The owner records what the provider dashboard shows for an unconfirmed refund (BS-26). */
    resolveRefund: builder.mutation<AdminPayment[], { orderNumber: string; refundId: string; outcome: "succeeded" | "failed"; note: string }>({
      query: ({ orderNumber, refundId, ...body }) => ({ url: `/admin/orders/${orderNumber}/refunds/${refundId}/resolve`, method: "POST", body }),
      invalidatesTags: (_r, _e, { orderNumber }) => [{ type: "AdminOrders", id: orderNumber }, "AdminOrders"],
    }),
    resolveAttention: builder.mutation<OrderView, { orderNumber: string; note: string }>({
      query: ({ orderNumber, note }) => ({ url: `/admin/orders/${orderNumber}/resolve-attention`, method: "POST", body: { note } }),
      invalidatesTags: (_r, _e, { orderNumber }) => [{ type: "AdminOrders", id: orderNumber }, "AdminOrders"],
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
    updateShipment: builder.mutation<AdminOrderView, ShipmentUpdateInput>({
      query: ({ orderNumber, ...body }) => ({ url: `/admin/orders/${orderNumber}/shipment`, method: "POST", body }),
      invalidatesTags: (_r, _e, { orderNumber }) => [{ type: "AdminOrders", id: orderNumber }, "AdminOrders"],
    }),
    adminOrders: builder.query<AdminOrderView[], { status?: string; q?: string; shipment?: "to_ship" }>({
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
  usePaymentOptionsQuery,
  useInitiatePaymentMutation,
  useVerifyPaymentMutation,
  useAdminOrderQuery,
  useAdminOrderPaymentsQuery,
  useRefundOrderMutation,
  useResolveRefundMutation,
  useResolveAttentionMutation,
  useUpdateShipmentMutation,
  useReleaseOrderMutation,
} = commerceApi;
