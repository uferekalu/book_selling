/** Plain-English names for audit log actions (backend `audit.record({ action })`), BS-12. */
const ACTIONS: Record<string, string> = {
  "auth.two_factor_enabled": "Turned on two-step verification",
  "auth.two_factor_disabled": "Turned off two-step verification",
  "auth.recovery_code_used": "Signed in with a recovery code",
  "user.role_changed": "Changed a person’s access",
  "payment.settled": "Payment confirmed",
  "refund.requested": "Refund started",
  "refund.resolved": "Unconfirmed refund settled by hand",
  "order.attention_resolved": "Order problem marked as dealt with",
  "order.shipment_processing": "Print order being prepared",
  "order.shipment_shipped": "Print order shipped",
  "order.shipment_delivered": "Print order delivered",
  "book.created": "Book created",
  "book.updated": "Book details changed",
  "book.published": "Book published",
  "book.unpublished": "Book taken off sale",
  "book.archived": "Book archived",
  "book.deleted": "Book deleted",
  "book.formats_changed": "Prices, formats or stock changed",
  "book.cover_changed": "Cover changed",
  "book.gallery_added": "Gallery image added",
  "book.gallery_removed": "Gallery image removed",
  "book.manuscript_changed": "Book file replaced",
  "book.preview_sections_changed": "Free preview pages changed",
  "book.preview_rebuild_requested": "Free preview rebuilt",
  "author.created": "Author added",
  "author.updated": "Author changed",
  "author.photo_changed": "Author photo changed",
  "author.deleted": "Author removed",
  "category.created": "Subject added",
  "category.updated": "Subject changed",
  "category.deleted": "Subject removed",
  "coupon.created": "Discount code created",
  "coupon.updated": "Discount code changed",
  "review.hidden": "Review hidden",
  "review.shown": "Review shown again",
  "shipping_zone.created": "Shipping zone added",
  "shipping_zone.updated": "Shipping zone changed",
  "shipping_zone.deleted": "Shipping zone removed",
  "conversation.closed": "Conversation closed",
  "conversation.reopened": "Conversation reopened",
  "contact.replied": "Replied to a contact message",
  "contact.status_changed": "Contact message status changed",
  "messaging.settings_updated": "Messaging settings changed",
  "email.resent": "Email sent again",
  "email.problem_reviewed": "Email problem marked as handled",
  "email.address_allowed": "Emails allowed to an address again",
};

const ENTITIES: Record<string, string> = {
  order: "Order",
  book: "Book",
  user: "Person",
  author: "Author",
  category: "Subject",
  coupon: "Discount code",
  review: "Review",
  shipping_zone: "Shipping zone",
  conversation: "Conversation",
  contact_request: "Contact message",
  email: "Email",
  email_address: "Email address",
  settings: "Settings",
  payment: "Payment",
};

const sentence = (text: string) => {
  const words = text.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** "book.formats_changed" → "Prices, formats or stock changed"; unknown ones read as words. */
export function actionLabel(action: string): string {
  return ACTIONS[action] ?? sentence(action);
}

export function entityTypeLabel(type: string): string {
  return ENTITIES[type] ?? sentence(type);
}
