import { api } from "./api";

// Shapes of /conversations, /admin/conversations, /admin/contact-requests and /notifications
// (backend/src/messaging, backend/src/notifications; ARCHITECTURE §12).

export type SenderRole = "customer" | "staff";
export type ConversationStatus = "open" | "closed";
export type InboxFilter = "open" | "unread" | "order" | "closed" | "all";
export type ContactStatus = "new" | "replied" | "closed";

export interface MessageView {
  id: string;
  senderRole: SenderRole;
  senderName: string;
  body: string;
  createdAt: string;
  /** When the other side read it; null while unread. */
  readAt: string | null;
}

export interface ConversationSummary {
  id: string;
  subject: string;
  status: ConversationStatus;
  orderNumber: string | null;
  bookTitle: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageBy: SenderRole;
  /** Unread messages for whoever is asking. */
  unread: number;
  createdAt: string;
  /** Staff views only. */
  customer?: { id: string; name: string; email: string };
}

export interface ConversationDetail extends ConversationSummary {
  messages: MessageView[];
  hasMore: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ContactRequestView {
  id: string;
  name: string;
  email: string;
  subject: string;
  body: string;
  status: ContactStatus;
  replies: Array<{ staffName: string; body: string; at: string }>;
  createdAt: string;
}

export interface NotificationView {
  id: string;
  type: "message" | "contact" | "order_paid" | "order_shipped" | "order_delivered" | "refund" | "new_sale";
  title: string;
  body: string;
  /** A path inside the site. */
  link: string;
  read: boolean;
  createdAt: string;
}

export interface StartConversationInput {
  subject?: string;
  body: string;
  orderNumber?: string;
  bookId?: string;
}

export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  body: string;
  website: string;
  elapsedMs: number;
}

export const messagingApi = api.injectEndpoints({
  endpoints: (builder) => ({
    // ── customer
    conversations: builder.query<ConversationSummary[], void>({
      query: () => "/conversations",
      providesTags: ["Conversations"],
    }),
    conversation: builder.query<ConversationDetail, { id: string; before?: string }>({
      query: ({ id, before }) => ({ url: `/conversations/${id}`, params: before ? { before } : undefined }),
      providesTags: (_r, _e, { id }) => [{ type: "Conversation", id }],
    }),
    myUnreadMessages: builder.query<{ count: number }, void>({
      query: () => "/conversations/unread-count",
      providesTags: ["Conversations"],
    }),
    startConversation: builder.mutation<ConversationDetail, StartConversationInput>({
      query: (body) => ({ url: "/conversations", method: "POST", body }),
      invalidatesTags: ["Conversations"],
    }),
    sendMessage: builder.mutation<MessageView, { id: string; body: string }>({
      query: ({ id, body }) => ({ url: `/conversations/${id}/messages`, method: "POST", body: { body } }),
      invalidatesTags: (_r, _e, { id }) => ["Conversations", { type: "Conversation", id }],
    }),
    markConversationRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/conversations/${id}/read`, method: "POST" }),
      invalidatesTags: ["Conversations", "Notifications"],
    }),

    // ── staff
    inbox: builder.query<Page<ConversationSummary>, { filter: InboxFilter; page: number }>({
      query: (params) => ({ url: "/admin/conversations", params }),
      providesTags: ["Inbox"],
    }),
    inboxConversation: builder.query<ConversationDetail, { id: string; before?: string }>({
      query: ({ id, before }) => ({ url: `/admin/conversations/${id}`, params: before ? { before } : undefined }),
      providesTags: (_r, _e, { id }) => [{ type: "Conversation", id }],
    }),
    inboxUnread: builder.query<{ conversations: number; contact: number }, void>({
      query: () => "/admin/inbox/unread-count",
      providesTags: ["Inbox", "ContactRequests"],
    }),
    staffReply: builder.mutation<MessageView, { id: string; body: string }>({
      query: ({ id, body }) => ({ url: `/admin/conversations/${id}/messages`, method: "POST", body: { body } }),
      invalidatesTags: (_r, _e, { id }) => ["Inbox", { type: "Conversation", id }],
    }),
    staffMarkRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/conversations/${id}/read`, method: "POST" }),
      invalidatesTags: ["Inbox", "Notifications"],
    }),
    setConversationStatus: builder.mutation<ConversationSummary, { id: string; status: ConversationStatus }>({
      query: ({ id, status }) => ({ url: `/admin/conversations/${id}/status`, method: "POST", body: { status } }),
      invalidatesTags: (_r, _e, { id }) => ["Inbox", { type: "Conversation", id }],
    }),
    contactRequests: builder.query<Page<ContactRequestView>, { status: ContactStatus | "all"; page: number }>({
      query: (params) => ({ url: "/admin/contact-requests", params }),
      providesTags: ["ContactRequests"],
    }),
    contactRequest: builder.query<ContactRequestView, string>({
      query: (id) => `/admin/contact-requests/${id}`,
      providesTags: (_r, _e, id) => [{ type: "ContactRequests", id }],
    }),
    replyToContact: builder.mutation<ContactRequestView, { id: string; body: string }>({
      query: ({ id, body }) => ({ url: `/admin/contact-requests/${id}/reply`, method: "POST", body: { body } }),
      invalidatesTags: ["ContactRequests", "Notifications"],
    }),
    setContactStatus: builder.mutation<ContactRequestView, { id: string; status: ContactStatus }>({
      query: ({ id, status }) => ({ url: `/admin/contact-requests/${id}/status`, method: "POST", body: { status } }),
      invalidatesTags: ["ContactRequests", "Notifications"],
    }),
    updateMessagingSettings: builder.mutation<{ replyTime: string }, { replyTime: string }>({
      query: (body) => ({ url: "/admin/messaging/settings", method: "PUT", body }),
      invalidatesTags: ["MessagingSettings"],
    }),

    // ── everyone
    messagingSettings: builder.query<{ replyTime: string }, void>({
      query: () => "/messaging/settings",
      providesTags: ["MessagingSettings"],
    }),
    sendContact: builder.mutation<{ status: "received" }, ContactInput>({
      query: (body) => ({ url: "/contact", method: "POST", body }),
    }),
    notifications: builder.query<{ items: NotificationView[]; unreadCount: number }, void>({
      query: () => "/notifications",
      providesTags: ["Notifications"],
    }),
    markNotificationRead: builder.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "POST" }),
      invalidatesTags: ["Notifications"],
    }),
    markAllNotificationsRead: builder.mutation<void, void>({
      query: () => ({ url: "/notifications/read-all", method: "POST" }),
      invalidatesTags: ["Notifications"],
    }),
  }),
});

/** Pass to message and bell queries: the socket is the fast path, focus/reconnect the safety net. */
export const LIVE = { refetchOnFocus: true, refetchOnReconnect: true } as const;

export const {
  useConversationsQuery,
  useConversationQuery,
  useLazyConversationQuery,
  useMyUnreadMessagesQuery,
  useStartConversationMutation,
  useSendMessageMutation,
  useMarkConversationReadMutation,
  useInboxQuery,
  useInboxConversationQuery,
  useLazyInboxConversationQuery,
  useInboxUnreadQuery,
  useStaffReplyMutation,
  useStaffMarkReadMutation,
  useSetConversationStatusMutation,
  useContactRequestsQuery,
  useContactRequestQuery,
  useReplyToContactMutation,
  useSetContactStatusMutation,
  useUpdateMessagingSettingsMutation,
  useMessagingSettingsQuery,
  useSendContactMutation,
  useNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = messagingApi;
