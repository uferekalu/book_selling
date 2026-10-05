import { api } from "./api";

// Shapes of /admin/emails (backend/src/mail/admin-emails.*, BS-30): emails that didn't arrive.

export type EmailProblem = "not_sent" | "bounced" | "failed" | "complained";

export interface EmailProblemView {
  id: string;
  to: string;
  template: string;
  label: string;
  subject: string | null;
  problem: EmailProblem;
  status: string;
  deliveryStatus: string | null;
  lastError: string | null;
  attempts: number;
  createdAt: string;
  sentAt: string | null;
  orderNumber: string | null;
  canResend: boolean;
  addressPaused: boolean;
  reviewedAt: string | null;
}

export const emailsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    emailProblems: builder.query<{ items: EmailProblemView[]; total: number; page: number; pageSize: number }, { show: "open" | "all"; page: number }>({
      query: (params) => ({ url: "/admin/emails/problems", params }),
      providesTags: ["AdminEmails"],
    }),
    emailProblemCount: builder.query<{ open: number }, void>({
      query: () => "/admin/emails/problems/count",
      providesTags: ["AdminEmails"],
    }),
    resendEmail: builder.mutation<EmailProblemView, string>({
      query: (id) => ({ url: `/admin/emails/${id}/resend`, method: "POST" }),
      invalidatesTags: ["AdminEmails"],
    }),
    markEmailReviewed: builder.mutation<EmailProblemView, string>({
      query: (id) => ({ url: `/admin/emails/${id}/reviewed`, method: "POST" }),
      invalidatesTags: ["AdminEmails"],
    }),
    allowEmailAddress: builder.mutation<{ email: string; paused: false }, string>({
      query: (email) => ({ url: "/admin/emails/allow-address", method: "POST", body: { email } }),
      invalidatesTags: ["AdminEmails"],
    }),
  }),
});

export const { useEmailProblemsQuery, useEmailProblemCountQuery, useResendEmailMutation, useMarkEmailReviewedMutation, useAllowEmailAddressMutation } =
  emailsApi;
