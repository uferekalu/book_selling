# Product Rules

What the product does and the rules it must follow. When code and this document disagree, one of
them is a bug. Ask which before "fixing" either. Technical design is in
[`ARCHITECTURE.md`](ARCHITECTURE.md).

## 1. The product

An online bookstore for **one author**, a mechanical engineering lecturer, selling his own
books to readers **anywhere in the world**, in two formats:

- **Ebook (PDF)**: instant access after payment. Read online in the browser or download.
- **Print**: a physical copy shipped to the buyer's address.

Success means a stranger in Lagos, London or Houston can find a book, **read its abstract and
introduction**, decide to buy, pay in their own currency with a method they trust, and receive the
book, without friction and without anything going wrong with their money.

## 2. People

| Person | What they need |
|---|---|
| **Visitor** (not logged in) | Browse, search, read previews, buy as a guest, contact the author |
| **Customer** | All of the above, plus order history, a library of ebooks (read and download), messages, addresses, reviews, wishlist |
| **Admin** | Manage books, orders, shipments, customers, coupons, messages. Can issue refunds up to the threshold. Must use 2FA |
| **Owner** (the lecturer) | Everything an admin can do, plus manage admins, large refunds, settings and payment-provider switches |

Typical readers: engineering students (price-sensitive, often mobile, often in Nigeria), working
engineers, and university libraries and lecturers elsewhere.

## 3. Catalogue

- A book is visible to customers only when `published`, which requires a cover, an abstract, at
  least one active format with a price **in every enabled currency**, a manuscript PDF, and an
  enabled preview.
- Each book page shows: cover (3D), title, subtitle, edition, author, abstract (as text), rating,
  format selector with price in the visitor's currency, stock status for print ("In stock", "Only 3
  left", "Out of stock": ebook still purchasable), "Read the introduction" button, table of contents,
  details (ISBN, pages, publication date, language), reviews and related books.
- Search covers title, subtitle, description and tags, with filters by category, format and price,
  and sorting by relevance, newest, price and rating.
- Book URLs (`/books/<slug>`) never change once published. If a title changes, the old slug
  redirects.
- **Adding a book** (ARCHITECTURE §10.0):
  - Covers are at least 1200×1800px and cropped to 2:3 in the editor, so a title is never cut off.
  - The manuscript must be a normal, unencrypted PDF.
  - The editor saves drafts automatically and won't publish until the checklist above passes.
- **Archiving a book never breaks a buyer's library.** It disappears from the store; owners keep
  reading and downloading it. A corrected manuscript reaches existing ebook owners automatically,
  with an email.

## 4. Preview: "Read before you buy"

The lecturer's rule: **a reader can see the abstract and introduction of any book; to go further
they are asked to buy.** This must feel smooth and trustworthy, never like a trap.

1. Every published book has a preview. The admin chooses the preview sections by page range
   (usually Abstract + Introduction). The preview **may not exceed 15% of the book's pages** (a
   setting the owner can change).
2. Anyone can read the preview: **no account, no email, no pop-up gate.**
3. Only the preview pages ever leave the server before purchase. Locked pages are never sent to the
   browser, blurred or otherwise (except two deliberately unreadable thumbnail hints).
4. The reader shows the **whole table of contents**. Locked chapters show a lock and, when tapped,
   explain that the chapter is in the full book.
5. The reader always shows where you are: "Page 14 of 18 free pages · 342 pages in the full book".
6. Reaching the end of the preview shows an inline "Continue reading" card with the price in the
   reader's currency and buy options for ebook and/or print. **No interruptions before the end**
   except one gentle, dismissible hint at 80%.
7. Buying from the reader happens in a drawer over the reader. After paying for the ebook, the
   buyer is taken **straight back to the page where they stopped**, now with the full book
   unlocked.
8. The reader works on a 375px phone as well as on desktop: pinch zoom, swipe between pages,
   keyboard shortcuts, full-screen mode, and light, dark and sepia paper.
9. The abstract is also shown as normal text on the book page, so it loads instantly and search
   engines index it.

## 5. Pricing and currencies

- Enabled currencies: **NGN, USD, GBP, EUR**. The lecturer sets an **explicit price per currency
  per format**. There is no automatic exchange-rate conversion: the price shown is exactly the
  price charged.
- The currency is suggested from the visitor's country (Nigeria → NGN, UK → GBP, euro-area → EUR,
  everyone else → USD) and can always be switched in the header. The cart and order use one
  currency.
- Prices shown include any tax (see §9). The shipping cost is shown before payment, never after.
- "Was" prices (compare-at) may be shown for sales.

## 6. Cart and checkout

- The cart works for guests (kept for 30 days on that browser) and follows the customer across
  devices once logged in. A guest cart merges into the account on login.
- The cart always shows current prices. If a price changed since the item was added, the cart says
  so.
- **An ebook can only be bought once per account.** If the customer already owns it, the cart
  shows "In your library" instead of adding it.
- Print quantities are limited by stock and by a per-order maximum (default 5).
- **Guest checkout is allowed**: email + name (+ shipping address for print). An account is
  created in the background and a "set your password" email lets the buyer claim it and see their
  library later.
- Checkout steps: Details → Shipping (skipped for ebook-only) → Review & pay. The total shown on
  "Review & pay" is exactly the amount the payment page charges.
- Stock and coupon are **held for 30 minutes** once the customer proceeds to payment. If payment
  doesn't complete, the order expires and the hold is released. The customer gets one "complete
  your order" email.
- Coupons: percentage or fixed-amount (per currency), with optional minimum spend, date window,
  total and per-customer limits, and restriction to certain books or formats. One coupon per order.

## 7. Payment

- Providers: **Paystack**, **Flutterwave** and **Stripe**. The default is chosen by currency (NGN →
  Paystack; USD/GBP/EUR → Stripe), and the buyer may choose another provider that supports their
  currency.
- Card details are entered only on the provider's secure page, never on ours.
- **An order is marked paid only when our server has confirmed the payment directly with the
  provider** (a verified webhook or a server-to-server check), and the confirmed amount and currency
  match the order exactly. What the browser says is never trusted.
- A buyer is **never charged twice** for one order. A second successful payment on the same order is
  refused by design. If one ever slips through at a provider, it is flagged for refund.
- If a payment fails, the order stays open until it expires and the buyer can retry, with the same
  or a different provider.
- If confirmation is slow, the buyer sees "We're confirming your payment", not an error. The page
  updates itself, and a confirmation email follows.
- A payment confirmed after the order expired is still honoured (§ARCHITECTURE 8.4). If print stock
  ran out meanwhile, the owner is alerted to ship later or refund.

## 8. Delivery

### Ebooks
- Available **immediately** after payment, in **My Library**, to read online (any device, resumes
  where you left off) or download as PDF.
- Downloads use links that expire after 5 minutes. A customer may download a book up to 10 times per
  hour. There is no lifetime cap for honest use; abuse patterns alert the owner.
- If enabled for the book, each copy is personalised with the buyer's name, email and order number
  in the page footer.

### Print
- Shipping is priced by zone (e.g. Nigeria, Africa, UK and Europe, Rest of world) as a first-item
  fee plus a fee per additional item, per currency, with an estimated delivery window shown at
  checkout.
- Shipment status: Processing → Shipped (with carrier and tracking link) → Delivered. The buyer is
  emailed at each step.
- Orders with both ebook and print items deliver the ebook immediately and ship the print copy.

## 9. Tax, refunds and legal

- v1 prices are **tax-inclusive** and no tax is calculated separately. **Open question for the
  owner before launch:** selling ebooks to consumers in the EU/UK can create VAT obligations (OSS
  scheme). Options: register for OSS, or restrict EU/UK ebook sales until registered. Tracked in
  ROADMAP BS-13.
- **Refund policy** (placeholder until the owner confirms the wording):
  - Ebooks: refundable within 7 days if not downloaded or read beyond the preview.
  - Print: returns within 14 days of delivery in original condition.
  - Damaged or wrong items are always replaced or refunded.
- A full refund removes the ebook from the buyer's library.
- Required pages: Terms of Sale, Refund Policy, Privacy Policy, Shipping Policy, Contact.
- Privacy: NDPA (Nigeria) and GDPR-style rights. Customers can export their data and delete their
  account. Marketing emails require explicit opt-in.

## 10. Email

Every email is branded, readable on a phone, includes a plain-text version, and never contains a
password or full payment details.

| Trigger | Email |
|---|---|
| Registration | Verify your email (link valid 24 h) |
| Email verified | Welcome |
| Guest checkout | Set your password / claim your account (link valid 7 days) |
| Forgot password | Reset link (valid 1 h, single use) |
| New device login, 2FA change | Security notice |
| Payment confirmed | **Receipt** with line items, totals, payment method and PDF invoice |
| Ebook purchased | Your book is ready: read or download |
| Payment failed | What happened, and a link to retry |
| Order expired | Complete your order (sent once) |
| Shipment updates | Shipped (tracking), delivered |
| Refund | Refund issued (amount, method, timing) |
| New message, unread for 10 min | You have a new message |
| Owner alerts | New sale, payment needs attention, low stock, email delivery failure |

An email that has been triggered is **always** eventually sent or visibly marked failed for the
owner. No email is ever sent twice for the same event.

## 11. Messaging

- Customers can message the author/store from their account, from an order ("Question about this
  order") or from a book page ("Ask the author"). Visitors use the contact form.
- Messages appear instantly for both sides when online. Read receipts and unread counts are shown.
- If the recipient hasn't read a message within 10 minutes, they get an email.
- The staff inbox shows all conversations with filters (open, unread, linked to an order) and
  can close or reopen them.
- The customer sees the expected reply time (set by the owner, e.g. "usually replies within a day").

## 12. Reviews and wishlist

- Only verified buyers can review, once per book, with a 1–5 rating and optional text. Admins can
  hide abusive reviews but never edit them.
- Customers can save books to a wishlist.

## 13. Admin

- Dashboard: revenue per currency (never summed across currencies without an explicit
  conversion label), orders, conversion from preview to purchase per book, best sellers, low stock.
- **"Needs attention" queue**: amount mismatches, ambiguous refunds, late payments without stock,
  dead-letter emails. It is the first thing on the dashboard when it isn't empty.
- Book editor: details, abstract, TOC, formats and per-currency prices, stock, cover and gallery,
  manuscript upload, and a preview section picker with page thumbnails and a live preview.
- Orders: search, detail, timeline, shipment updates, refunds (full or partial, with a reason).
- Customers, coupons, shipping zones, messages, settings.
- Every admin action is recorded in the audit log.

## 14. Quality bar

- **Accessibility**: WCAG 2.2 AA. Full keyboard support, visible focus, screen-reader labels,
  sufficient contrast in both themes, 44px touch targets, reduced-motion respected.
- **Performance** (on mid-range mobile, 4G): LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on the home and
  book pages. The reader is lazy-loaded.
- **Responsive**: every page works from 375px up. Design mobile-first.
- **Light and dark themes**, both first-class.
- **Language**: English for v1. Copy is clear and warm, not salesy.
