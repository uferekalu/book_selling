import { describe, expect, it } from "vitest";
import { contactSchema, messageSchema, newConversationSchema } from "./schemas";

describe("messaging schemas", () => {
  it("a message needs text, up to 5,000 characters", () => {
    expect(messageSchema.safeParse({ body: "  \n " }).success).toBe(false);
    expect(messageSchema.safeParse({ body: "x".repeat(5001) }).success).toBe(false);
    expect(messageSchema.parse({ body: "  Hello  " })).toEqual({ body: "Hello" });
  });

  it("a subject is required only for a general question", () => {
    expect(newConversationSchema(true).safeParse({ subject: " ", body: "Hi" }).success).toBe(false);
    expect(newConversationSchema(false).safeParse({ subject: "", body: "Hi" }).success).toBe(true);
  });

  it("the contact form checks the email and keeps the spam trap", () => {
    const valid = { name: "Chidi", email: "chidi@example.com", subject: "Order", body: "Hello", website: "" };
    expect(contactSchema.safeParse(valid).success).toBe(true);
    expect(contactSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });
});
