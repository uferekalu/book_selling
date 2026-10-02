import { api } from "./api";

/**
 * PDFs the API streams (invoices). The response becomes a temporary object URL inside the query,
 * so the store only ever holds a string, and the usual sign-in refresh applies. Errors keep their
 * JSON body for `errorMessage`. Callers save it with `saveObjectUrl`, which also releases it.
 */
const asObjectUrl = async (response: Response): Promise<unknown> =>
  response.ok ? URL.createObjectURL(await response.blob()) : response.json().catch(() => null);

export const filesApi = api.injectEndpoints({
  endpoints: (builder) => ({
    invoice: builder.mutation<string, string>({
      query: (orderNumber) => ({ url: `/orders/${orderNumber}/invoice`, responseHandler: asObjectUrl }),
    }),
    guestInvoice: builder.mutation<string, { orderNumber: string; checkoutKey: string }>({
      query: (body) => ({ url: "/guest-orders/invoice", method: "POST", body, responseHandler: asObjectUrl }),
    }),
    adminInvoice: builder.mutation<string, string>({
      query: (orderNumber) => ({ url: `/admin/orders/${orderNumber}/invoice`, responseHandler: asObjectUrl }),
    }),
  }),
});

export const { useInvoiceMutation, useGuestInvoiceMutation, useAdminInvoiceMutation } = filesApi;

/** Saves an object URL as a file, then releases it. */
export function saveObjectUrl(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
