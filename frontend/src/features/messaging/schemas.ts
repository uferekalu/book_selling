import { z } from "zod";

/** Mirrors backend MESSAGE_MAX_LENGTH (messaging/schemas/message.schema.ts). */
export const MESSAGE_MAX = 5000;

const body = z.string().trim().min(1, "Write a message first").max(MESSAGE_MAX, `Messages can be up to ${MESSAGE_MAX.toLocaleString("en")} characters`);

export const messageSchema = z.object({ body });
export type MessageValues = z.infer<typeof messageSchema>;

/** A subject is needed unless the conversation is about an order or a book (it is then named after it). */
export const newConversationSchema = (subjectRequired: boolean) =>
  z.object({
    subject: subjectRequired
      ? z.string().trim().min(1, "Add a subject").max(140, "Keep the subject under 140 characters")
      : z.string().trim().max(140, "Keep the subject under 140 characters"),
    body,
  });
export type NewConversationValues = z.infer<ReturnType<typeof newConversationSchema>>;

export const contactSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(100, "Keep your name under 100 characters"),
  email: z.string().trim().toLowerCase().min(1, "Enter your email address").email("Enter a valid email address").max(200),
  subject: z.string().trim().min(1, "Add a subject").max(140, "Keep the subject under 140 characters"),
  body,
  /** Honeypot: hidden from people, so only bots fill it in. */
  website: z.string().max(200),
});
export type ContactValues = z.infer<typeof contactSchema>;

export const replyTimeSchema = z.object({
  replyTime: z.string().trim().min(1, "Write how quickly you usually reply").max(120, "Keep it under 120 characters"),
});
export type ReplyTimeValues = z.infer<typeof replyTimeSchema>;
