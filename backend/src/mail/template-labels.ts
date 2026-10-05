import type { TemplateName } from './templates/registry.js';

/** What each email is, in the owner's words (admin Emails page and alerts, BS-30). */
export const TEMPLATE_LABEL: Record<TemplateName, string> = {
  'order.receipt': 'Payment receipt',
  'order.new-sale': 'New sale (to you)',
  'order.payment-attention': 'Payment needs attention (to you)',
  'order.complete-your-order': 'Complete your order reminder',
  'auth.verify-email': 'Confirm email address',
  'auth.welcome': 'Welcome',
  'auth.password-reset': 'Password reset link',
  'auth.claim-account': 'Set your password (guest buyer)',
  'auth.security-notice': 'Security notice',
  'order.shipped': 'Your book has shipped',
  'order.delivered': 'Your book was delivered',
  'order.refund-issued': 'Refund issued',
  'library.edition-updated': 'Updated edition in your library',
  'ops.download-abuse': 'Unusual downloads (to you)',
  'ops.copy-failed': 'Ebook copy problem (to you)',
  'ops.email-dead-letter': 'Email not delivered (to you)',
  'ops.email-bounced': 'Email bounced (to you)',
  'messaging.unread-message': 'You have a new message',
  'messaging.contact-received': 'Contact form: we received your message',
  'messaging.contact-new': 'Contact form message (to you)',
  'messaging.contact-reply': 'Reply to a contact form message',
};

/**
 * Emails a buyer relies on for something they paid for or asked for. When one of these bounces,
 * the owner is told (the buyer can't be reached by email and won't know).
 */
export const BOUNCE_ALERT_TEMPLATES: ReadonlySet<string> = new Set([
  'order.receipt',
  'auth.claim-account',
  'order.shipped',
  'order.delivered',
  'order.refund-issued',
  'library.edition-updated',
  'messaging.unread-message',
  'messaging.contact-received',
  'messaging.contact-reply',
]);

export function templateLabel(template: string): string {
  return (TEMPLATE_LABEL as Record<string, string>)[template] ?? template;
}
