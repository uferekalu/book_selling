# Architecture

Technical design for the Book Selling Platform. Product behaviour lives in
[`PRODUCT_RULES.md`](PRODUCT_RULES.md); how we work lives in
[`ENGINEERING_RULES.md`](ENGINEERING_RULES.md); hosting lives in [`DEPLOYMENT.md`](DEPLOYMENT.md);
sequencing lives in [`ROADMAP.md`](ROADMAP.md).

This document is written **before** most of the code exists. Each section says which ticket builds
it. When a ticket implements a section, it updates that section to match what was actually built
(docs/ENGINEERING_RULES.md §8). The code wins over a stale doc, but a stale doc is a bug.

Much of this design is borrowed from `food_ordering_platform` (same author, same stack, live in
production). Where we deliberately differ, the section says so and why.

---

## 1. Repository layout

```
book_selling/
├── backend/            NestJS 12 API (ESM, Vitest, oxlint)         → Render
├── frontend/           Next.js 16 App Router, Tailwind v4          → Vercel
├── docs/               this folder
├── .claude/skills/     project skills for Claude Code sessions
├── .github/workflows/  CI (required status checks on `main`)
└── render.yaml         Render Blueprint for the API
```

Two independent apps with their own `package.json` and lockfile, and no workspace tooling. They
deploy to different hosts on different schedules, and sharing code between them would couple two
build pipelines to save a few type definitions.

**Shared types.** The API contract is the source of truth: backend DTOs carry `@ApiProperty`,
Swagger is served at `/api/docs`, and frontend types in `frontend/src/lib/api/types.ts` mirror the
response shapes. A contract change updates both sides in the same PR.

## 2. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| API framework | NestJS 12, TypeScript strict, **ESM** | Relative imports end in `.js` (NodeNext resolution) |
| Database | MongoDB (Atlas in prod) via Mongoose 9 | Replica set required: transactions are used for money paths |
| Validation | `class-validator` DTOs + global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) | Env validated with Joi at boot |
| Logging | `nestjs-pino`; JSON in prod, pretty in dev, silent in test | Auth headers, cookies and provider signatures are redacted |
| Rate limiting | `@nestjs/throttler` global 100/min + tighter per-route limits | `trust proxy = 1` (one hop, Render) |
| Docs | Swagger at `/api/docs` | |
| Health | Terminus `GET /health` (MongoDB ping) | Extended as dependencies are added |
| Payments | Stripe, Paystack, Flutterwave behind one adapter interface | §9 |
| Email | Resend + React Email templates, transactional outbox | §11 |
| Realtime | Socket.IO gateway (messaging, notifications, order status) | §12 |
| Files | Cloudinary: public covers/images; **authenticated (private) raw assets for ebook files** | §10 |
| Scheduling | `@nestjs/schedule` | Outbox worker, payment reconciliation, order expiry |
| Backend tests | Vitest; e2e boots the real `AppModule` against `mongodb-memory-server` | |
| Frontend | Next.js 16 App Router, React 19, TypeScript strict | RSC for catalogue/SEO pages, client components for cart/checkout |
| Styling | Tailwind CSS v4 (CSS-first `@theme`), design tokens | §6 |
| Frontend state | Redux Toolkit + RTK Query (one `api` instance) | §7 |
| Forms | `react-hook-form` + Zod | |
| Motion | CSS token animations; `motion` (Framer Motion) added when a screen needs gestures/physics | Always honours `prefers-reduced-motion` |
| Frontend tests | Vitest + React Testing Library (jsdom) | |

## 3. Backend module map

One Nest module per domain (`backend/src/<domain>/`). `src/common/` holds cross-cutting
infrastructure only (config, filters, decorators, money utilities), never domain logic.

| Module | Owns | Ticket |
|---|---|---|
| `health` | `/health` | BS-1 |
| `database` | Mongoose connection | BS-1 |
| `mail` | outbox, templates, Resend delivery webhooks, suppression list | BS-3 |
| `jobs` | lease-locked scheduled jobs (`job_locks`) | BS-3 |
| `users` | users, addresses, roles, suspension | BS-4 |
| `auth` | login, register, refresh rotation, email verification, password reset, guest-account claim, admin 2FA | BS-4 |
| `audit` | append-only audit log writes | BS-4 onward |
| `catalog` | books, formats, authors, categories, search | BS-5 |
| `uploads` | Cloudinary signed uploads (public images, private manuscripts) | BS-5 |
| `preview` | preview PDF generation, preview endpoint, reading progress, preview analytics | BS-6 |
| `cart` | carts for users and guests | BS-7 |
| `shipping` | shipping zones and rates | BS-7 |
| `coupons` | coupons and redemptions | BS-7 (engine), BS-11 (admin UI) |
| `checkout` | server-side quote (pricing, shipping, coupon, totals) | BS-7 |
| `orders` | orders, state machine, stock reservation, expiry | BS-7 |
| `payments` | payment attempts, adapters, webhooks, verify, reconciliation, refunds | BS-8 |
| `library` | ebook entitlements, online reading, signed downloads, PDF stamping | BS-9 |
| `fulfillment` | shipments for print items | BS-9 |
| `messaging` | conversations, messages, contact form | BS-10 |
| `notifications` | in-app notifications | BS-10 |
| `realtime` | Socket.IO gateway | BS-10 |
| `reviews`, `wishlist` | reviews, wishlists | BS-11 |
| `admin` | analytics, "needs attention" queue, audit log reads | BS-12 |

Dependency direction: `payments → orders → catalog`. `library` and `mail` are called from order
settlement, not the other way round. Circular module imports are a production boot crash that only
the e2e suite catches (docs/ENGINEERING_RULES.md §5).

## 4. Data model

MongoDB, one collection per aggregate. All `_id`s are ObjectIds; timestamps (`createdAt`,
`updatedAt`) are on every schema.

**The ObjectId/string rule (from the reference project, learned the hard way).** Ref fields built
with `@Prop()` do not reliably cast between `string` and `ObjectId`. A query with the "wrong" type
silently matches zero documents with no error. Service methods take `id: string`, ref fields are
declared `type: Types.ObjectId`, and every write and query converts explicitly
(`new Types.ObjectId(id)` on the way in, `.toString()` on the way out). There is one helper in
`common/utils/object-id.ts` and tests assert on real DB state, not just return values.

**Money is always an integer in minor units** (kobo, cents, pence) plus an ISO-4217 currency code:
`{ amount: 2500000, currency: 'NGN' }` is ₦25,000.00. Never a float, never a major-unit number in
the database. This is a deliberate change from the reference project, which stored major-unit
floats. See §8.

### 4.1 Identity

**`users`**
| Field | Type | Notes |
|---|---|---|
| email | string | unique, lowercase, trimmed |
| passwordHash | string \| null | bcryptjs cost 12. `null` for an unclaimed guest account |
| name | string | |
| role | `customer` \| `admin` \| `owner` | `owner` = the lecturer; only an owner can manage admins or approve refunds above a threshold |
| accountStatus | `active` \| `unclaimed` \| `suspended` | guest checkout creates `unclaimed` (§8.2) |
| emailVerifiedAt | Date \| null | |
| twoFactor | `{ enabled, secretEnc, recoveryCodeHashes[] }` | TOTP; **required** for `admin`/`owner` |
| preferredCurrency | `NGN` \| `USD` \| `GBP` \| `EUR` | |
| country | ISO-3166 alpha-2 | |
| addresses | embedded `Address[]` (max 10) | `{ label, fullName, phone, line1, line2, city, state, postalCode, country, isDefault }` |
| marketingOptIn | boolean | default false; explicit consent only |
| lastLoginAt | Date | |

Indexes: `{ email: 1 }` unique.

**`refresh_tokens`**: `userId`, `tokenHash` (SHA-256, unique), `familyId`, `expiresAt` (TTL index),
`revokedAt`, `replacedByHash`, `userAgent`, `ip`. There is one document per device session, rotated
on every use. Replaying an already-rotated token revokes the whole family (§5).

**`auth_tokens`**: single-use tokens for `verify_email`, `reset_password` and `claim_account`.
Fields: `userId`, `purpose`, `tokenHash` (unique), `expiresAt` (TTL), `usedAt`. We use hashed random
tokens instead of the reference's purpose-scoped JWTs because they are single-use and revocable:
a reset link stops working once used.

### 4.2 Catalogue

**`authors`**: `name`, `slug` (unique), `title` (e.g. "Professor of Mechanical Engineering"),
`bio`, `photo`, `affiliations[]`, `socialLinks`. Usually one document (the lecturer). It is still
modelled as a collection so co-authored titles work.

**`categories`**: `name`, `slug` (unique), `description`, `sortOrder`. Examples: Thermodynamics,
Fluid Mechanics, Machine Design, Strength of Materials.

**`books`**
| Field | Type | Notes |
|---|---|---|
| title, subtitle | string | |
| slug | string | unique, stable (URLs and SEO) |
| authorIds, categoryIds | ObjectId[] | |
| description | string (sanitised rich text) | |
| tableOfContents | `{ title, children[] }[]` | |
| isbn13, edition, publishedAt, pageCount, language | | |
| cover | `{ publicId, url, width, height, blurDataUrl }` | |
| gallery | same shape [] | sample spreads |
| abstract | string (sanitised rich text) | also rendered as HTML on the book page (SEO, instant read) |
| manuscript | `{ assetId (private), pageCount, uploadedAt, checksum }` | **the private master PDF**: the source for the preview, online reading and ebook downloads. Required to publish, even for print-only books, so every book has a preview |
| preview | `Preview` | see below |
| status | `draft` \| `published` \| `archived` | only `published` is visible to customers |
| formats | `BookFormat[]` | see below; at least one active format to publish |
| ratingAvg, ratingCount | number | denormalised from reviews |
| tags | string[] | |
| seo | `{ title, description }` | |

**`BookFormat`** (embedded, `type` unique per book)
| Field | Notes |
|---|---|
| type | `ebook` \| `print` |
| sku | unique across all books (partial unique index on `formats.sku`) |
| active | boolean |
| prices | `{ currency, amount }[]`: **one explicit price per enabled currency** (§8.1); no FX conversion |
| compareAtPrices | optional "was" prices, same shape |
| ebook | `{ fileFormat: 'pdf', stampWithBuyer: boolean }`; the file itself is `book.manuscript` |
| print | `{ stockOnHand, stockReserved, weightGrams, dimensionsMm, maxPerOrder }` |

**`Preview`** (embedded; what a visitor can read before buying, §10)
| Field | Notes |
|---|---|
| enabled | boolean; required `true` to publish |
| sections | `{ label, startPage, endPage }[]`, e.g. Abstract 1–2, Introduction 3–18. 1-based manuscript page numbers; contiguous or not |
| maxPreviewPercent | settings-level cap (default 15% of `pageCount`). The admin UI refuses more, so the book can't be accidentally given away |
| assetId, pageCount | the **generated** preview PDF (public-readable, watermarked "Preview"), containing only the section pages |
| lockedTeasers | `{ url }[]`: 2 tiny, heavily blurred renders of the first pages *after* the preview (≤ 48px wide, upscaled with CSS blur; unreadable by construction) |
| outline | `{ title, page, level, inPreview }[]`: the full table of contents, so the reader shows locked chapters |
| generatedAt, sourceChecksum | regenerated automatically whenever the manuscript or sections change |

Stock invariant: `0 ≤ stockReserved ≤ stockOnHand`. It is only ever changed by the conditional
atomic updates in §8.3, never by read-modify-write.

Indexes: `slug` unique; `formats.sku` unique (partial); `status + publishedAt`; a text index on
`title`, `subtitle`, `description` and `tags` (weights 10/5/1/3) for search.

### 4.3 Commerce

**`carts`**: `userId` (unique, sparse) or `guestId` (unique, sparse; random ID in an httpOnly
cookie), `items: { bookId, format, quantity }[]`, `currency`, `expiresAt` (TTL; 30 days for guests).
**A cart stores no prices.** Every read re-prices from the catalogue, so a price change can never be
bought at a stale price. Merged into the user's cart on login.

**`shipping_zones`**: `name`, `countries[]` (ISO alpha-2, a country belongs to at most one zone),
`rates: { currency, firstItem, additionalItem }[]` (minor units), `estimatedDays: { min, max }`,
`active`. A special "Rest of world" zone has `countries: ['*']`.

**`coupons`**: `code` (unique, uppercase), `kind: 'percent' | 'fixed'`, `percentOff` or
`amountsOff: { currency, amount }[]`, `minSubtotals[]`, `appliesTo: { bookIds[], formats[] }`,
`startsAt`, `endsAt`, `maxRedemptions`, `perCustomerLimit`, `redemptionCount`, `active`.
**`coupon_redemptions`**: `couponId`, `orderId` (unique), `email`, `userId`, `status: 'reserved' |
'redeemed' | 'released'`.

**`orders`**
| Field | Notes |
|---|---|
| orderNumber | unique, human-readable `BS-2026-000123`, from an atomic `counters` `$inc` |
| userId | the buyer; set for guests too (the unclaimed account) |
| email, customerName | snapshots |
| currency | one currency per order |
| items | `{ bookId, format, sku, titleSnapshot, coverSnapshot, unitAmount, quantity, lineTotal }[]` |
| subtotal, discountTotal, shippingTotal, taxTotal, total | minor units; `total = subtotal − discountTotal + shippingTotal + taxTotal`, asserted on save |
| coupon | `{ code, couponId }` snapshot \| null |
| shippingAddress, shippingZoneId | required iff any print item |
| status | `pending_payment` → `paid` → `fulfilled`; or `expired` / `cancelled`; post-payment `partially_refunded` / `refunded` (§8.4) |
| shipment | `{ status: 'not_required' \| 'pending' \| 'processing' \| 'shipped' \| 'delivered', carrier, trackingNumber, trackingUrl, shippedAt, deliveredAt }` |
| payment | `{ provider, paymentId, paidAt }`: pointer to the settled `payments` document |
| refundedTotal | minor units, sum of succeeded refunds |
| expiresAt | `pending_payment` only; stock reservation ends here (default 30 min) |
| checkoutKey | unique: the client's idempotency key for "place order" |
| statusHistory | `{ status, at, by, note }[]` |
| attention | `{ required: boolean, reason }`: set by money-safety checks for an admin to resolve |

Indexes: `orderNumber` unique; `checkoutKey` unique; `userId + createdAt`;
`status + expiresAt` (expiry sweep); `attention.required` (partial).

**`payments`**: one document per payment **attempt**. An order can have several (a failed card, a
switched provider); at most one ever reaches `succeeded`.
| Field | Notes |
|---|---|
| orderId | |
| provider | `stripe` \| `paystack` \| `flutterwave` |
| reference | **we generate it** (`BSP_` + ULID), unique; sent to the provider as their reference/`tx_ref`/`client_reference_id` |
| providerTransactionId | the provider's own ID (Stripe PaymentIntent, Paystack id, Flutterwave id); unique sparse |
| amount, currency | the exact amount we asked for |
| status | `initiated` → `succeeded` \| `failed` \| `abandoned`; after success `partially_refunded` \| `refunded` |
| verifiedAmount, verifiedCurrency | what the provider says was actually captured |
| refunds | `{ refundId, providerRefundId, amount, status: 'pending' \| 'succeeded' \| 'failed' \| 'outcome_unknown', reason, requestedBy, createdAt }[]` |
| reconciliationRequired | boolean + `reconciliationReason`: never auto-retried; an admin resolves it |
| lastVerifiedAt, failureReason | |

Indexes: `reference` unique; `providerTransactionId` unique sparse; `orderId`;
`status + createdAt` (reconciliation sweep); a partial unique index on
`{ orderId: 1 }` where `status ∈ {succeeded, partially_refunded, refunded}`. **The database itself
refuses a second successful payment for one order.**

**`webhook_events`**: `provider`, `eventId` (provider's event ID, or a SHA-256 of the raw body when
the provider has none), `type`, `reference`, `receivedAt`, `processedAt`,
`outcome: 'processed' | 'ignored' | 'failed'`, `error`. A unique `{ provider, eventId }` index makes
redelivery a no-op. TTL: 400 days.

**`counters`**: `{ _id: 'order:2026', seq }` for order numbers.

### 4.4 Delivery

**`entitlements`** (the customer's ebook library): `userId`, `bookId`, `orderId`, `grantedAt`,
`revokedAt`, `downloadCount`, `lastDownloadedAt`. Unique `{ userId, bookId }`: buying the same
ebook twice is blocked at checkout, and the index is the backstop.

**`download_events`**: `entitlementId`, `userId`, `kind: 'download' | 'read_online'`, `ip`,
`userAgent`, `at` (TTL 2 years). Used for abuse detection and rate limits.

**`reading_progress`**: `{ userId | anonId, bookId, lastPage, mode: 'preview' | 'full', updatedAt }`,
unique on `(userId|anonId, bookId)`. This lets a buyer resume at the page where they hit the
paywall. An anonymous reader's row (keyed by the guest cookie) is merged into the account on
login or checkout.

**`preview_events`** (conversion analytics): `bookId`, `anonId|userId`, `type: 'opened' |
'page_reached' | 'paywall_shown' | 'paywall_cta_clicked' | 'purchased_from_reader'`, `page`, `at`
(TTL 1 year). Aggregated in admin analytics (preview → purchase conversion per book).

### 4.5 Communication

**`email_outbox`**: `to`, `template`, `data`, `dedupeKey` (unique, e.g. `order-receipt:<orderId>`),
`status: 'queued' | 'sending' | 'sent' | 'failed' | 'dead' | 'cancelled'`, `attempts`,
`nextAttemptAt`, `lockedUntil`, `providerMessageId`, `lastError`,
`deliveryStatus: 'delivered' | 'bounced' | 'complained' | null`, `sendAfter` (delayed messages).
**`email_suppressions`**: `email` (unique), `reason: 'bounce' | 'complaint' | 'manual'`.

**`conversations`**: `customerId`, `subject`, `orderId?`, `status: 'open' | 'closed'`,
`lastMessageAt`, `lastMessagePreview`, `unread: { customer, staff }`.
**`messages`**: `conversationId`, `senderId`, `senderRole: 'customer' | 'staff'`, `body` (plain
text, max 5,000 characters), `attachments[]`, `readAt`. Index `conversationId + createdAt`.
**`contact_requests`**: messages from visitors who aren't logged in (`name`, `email`, `subject`,
`body`, `status`), converted into a conversation once the email is linked to an account.

**`notifications`**: `userId`, `type`, `title`, `body`, `link`, `readAt`. TTL 180 days.

### 4.6 Engagement and admin

**`reviews`**: `bookId`, `userId`, `rating` (1–5), `title`, `body`, `verifiedPurchase`,
`status: 'published' | 'hidden'`. Unique `{ bookId, userId }`.
**`wishlists`**: `userId` (unique), `bookIds[]`.
**`audit_logs`**: append-only. `actorId`, `actorRole`, `action` (e.g. `refund.requested`,
`book.price_changed`), `entityType`, `entityId`, `changes`, `ip`, `at`. Written for every admin
mutation and every money event; never updated or deleted.
**`settings`**: singleton. Store name, support email, enabled currencies, per-provider enable
switches, order expiry minutes, download policy.

## 5. Auth and authorization

Ported from the reference project, where it is proven in production:

- **Access token**: JWT, 15 minutes, returned in the response body, and held **only in Redux
  memory** (never `localStorage`, which limits XSS token theft). Payload: `sub`, `role`, `email`.
- **Refresh token**: opaque random 256-bit string in an `httpOnly; Secure` cookie with path
  `/api/auth`. It is stored hashed per session (§4.1), **rotated on every use**, and a replay of a
  rotated token revokes the whole family.
- **Cookie `SameSite`**: `Lax` in development, `None; Secure` in production. **All browser calls are
  proxied through the storefront's own origin** (`/api/*` → API via a Next.js rewrite, §7), so
  the cookie is first-party and survives Safari and private windows. This fixed a real
  "logged out on reload" bug in the reference project.
- **Default-deny guards**: `JwtAuthGuard` and `RolesGuard` are registered as `APP_GUARD`. Every route
  requires auth unless marked `@Public()`. `@Roles('admin', 'owner')` adds role checks.
  **Ownership is checked in services** (an order belongs to the requester) because a role label
  can't know which order is yours.
- **Admin 2FA**: `admin` and `owner` accounts must enrol TOTP. Admin routes also require the access
  token claim `mfa: true`, set only after a successful TOTP step. This is new compared with the
  reference; it matters because admins can issue refunds.
- **Rate limits**: login 5/min, register 5/min, forgot-password 3/15 min, all per IP. Lockout
  after 10 failed logins per account in 15 minutes.
- **Guest checkout → unclaimed account** (§8.2). An unclaimed account can't log in with a
  password until the buyer sets one through the emailed `claim_account` link. Their orders and
  library are already attached.
- **Refresh concurrency**: the frontend serialises refreshes with one `async-mutex` lock shared by
  the 401-retry path and the on-mount session restore. Without it, two concurrent refreshes race the
  single-use token, trip reuse detection and log the user out. This was a real bug in the reference
  project, hit right after a payment redirect.
- **Roles**: `customer` is the only role anyone can give themselves. The first `owner` is created
  with `npm run seed:owner -- email@example.com` once per environment. The owner grants and
  revokes `admin` through the API.

## 6. Design system (frontend)

**Aesthetic direction: "modern library".** Warm paper whites, espresso and walnut browns, a
restrained antique-gold accent, generous whitespace and an editorial serif for headlines. Book
covers are the hero content: shown with real depth (a 3D spine and page-edge treatment, soft
shadows) and subtle tilt/parallax on hover. A faint paper-grain texture sits on large surfaces.
Glass-effect overlays (backdrop blur) are used for the header, cart drawer and modals. Motion is
purposeful and quick (150–300 ms, ease-out), and is disabled under `prefers-reduced-motion`.

**Single source of truth:** `frontend/src/styles/tokens.css` (Tailwind v4 `@theme`; generates
utilities and real CSS custom properties), plus `frontend/src/styles/tokens.ts` (typed `var()`
accessors for the rare JS consumer). **No hex code, pixel value or font name appears in a
component.** If a value is missing, add a token first.

### 6.1 Colour tokens

Raw scales (theme-invariant):

| Step | `brown` (primary) | `paper` (neutral, warm) | `gold` (accent) |
|---|---|---|---|
| 50 | `#faf6f1` | `#fdfbf8` | `#fbf7ea` |
| 100 | `#f2e8dc` | `#f7f2ea` | `#f5ebcb` |
| 200 | `#e4cfb7` | `#ede5d8` | `#ead594` |
| 300 | `#d2b08b` | `#dccfbd` | `#dcbb5e` |
| 400 | `#bf8f62` | `#b9a994` | `#cfa53d` |
| 500 | `#a87445` | `#948470` | `#b88a2c` |
| 600 | `#8c5c36` | `#736553` | `#966b23` |
| 700 | `#6f4527` | `#574c3f` | `#784f21` |
| 800 | `#56351f` | `#3c342b` | `#634120` |
| 900 | `#3f2718` | `#26211b` | `#54371f` |
| 950 | `#24160d` | `#16120e` | `#301c0e` |

Semantic aliases: **the only colours components use.** Exact values live in
`frontend/src/styles/tokens.css` (light values in `@theme`, dark values as `--dark-*`). This table
lists the names and what each is for.

| Token(s) | Use |
|---|---|
| `background` · `surface` · `surface-raised` · `surface-sunken` | page · cards · overlays · wells and disabled inputs |
| `overlay` · `glass` | modal backdrop · frosted header and drawers (`.surface-glass`) |
| `border` · `border-strong` · **`border-input`** | dividers · emphasised outlines · form-control outlines (≥ 3:1, WCAG 1.4.11) |
| `text` · `text-muted` · `text-subtle` · `text-disabled` | body · secondary · captions and placeholders (still ≥ 4.5:1) · disabled |
| `primary` · `primary-hover` · `primary-active` · `on-primary` | brown actions and links. In dark mode primary becomes a light tan with dark text |
| `primary-subtle` · `on-primary-subtle` | tinted chips, selected cards |
| `accent` · `accent-hover` · `on-accent` · `accent-subtle` · `on-accent-subtle` | antique gold: highlights, "Buy ebook", ratings, eyebrows |
| `secondary` · `secondary-hover` · `secondary-active` | neutral interactive surfaces (secondary buttons, hover rows, skeletons) |
| `success` · `warning` · `danger` · `info` (+ `on-*`, `*-subtle`) | status. The tone colour is also readable as text on its own subtle background |
| `focus-ring` | the single keyboard focus outline colour |

**Enforced, not just documented:** `src/styles/tokens.contrast.test.ts` parses tokens.css and checks
41 foreground/background pairings in **each** theme (82 checks) against WCAG 2.2 AA. It also checks
that every semantic token has a dark value that is activated in both dark blocks. It caught a real
failure on its first run: the gold button's hover text measured 3.7:1. The fix was to lighten the
hover colour instead of darkening it.

**Rule from the reference project:** raw scale classes (`bg-paper-100`) do not change in dark
mode. Anything that must look right in both themes uses a semantic alias. A shipped dark-mode bug
(an unreadable highlighted dropdown item) came from exactly this mistake.

### 6.2 Other tokens

- **Typography**: `--font-display` = **Fraunces** (variable serif, optical sizing) for headings
  and book titles; `--font-sans` = **Inter** for UI and body text; `--font-mono` = **JetBrains
  Mono** for ISBNs and order numbers. Loaded via `next/font` (self-hosted, no layout shift). Type
  scale `xs`…`7xl` with paired line-heights and tracking, fluid (`clamp()`) for display sizes.
- **Radius**: `xs 4`, `sm 6`, `md 10`, `lg 14`, `xl 20`, `2xl 28`, `full`.
- **Shadow**: `xs`…`xl` in warm-tinted browns (never neutral grey), plus `book` (a cover
  resting on a surface) and `glow-accent`.
- **Motion**: `--duration-fast 120ms`, `base 200ms`, `slow 320ms`; easings `ease-out-soft`,
  `ease-in-out-soft` and `ease-spring`; keyframe animations `fade-in`, `rise-in`, `scale-in`,
  `sheet-up`, `slide-in-left/right` and `shimmer`. All motion is neutralised under
  `prefers-reduced-motion` (globals.css).
- **Z-index**: `base`, `sticky 100`, `header 200`, `dropdown 1000`, `drawer 1200`, `modal 1300`,
  `popover 1350` (portal overlays that may open inside a modal), `toast 1400`, `tooltip 1500`. Used
  as `z-(--z-modal)`.
- **Spacing and breakpoints**: Tailwind v4 defaults. Mobile-first, and every page works from
  **320px**. Layout helpers: `--container-max`, a fluid `--container-gutter` and `--header-height`.
  `.safe-x` and `.safe-bottom` keep content clear of notches and home indicators
  (`viewport-fit=cover`).
- **Textures**: `--texture-grain` (inline SVG noise data URI) used by `.surface-grain`.

### 6.3 Theming

Token-driven light/dark. Components never branch on a theme flag or use `dark:` variants; semantic
tokens swap values. Dark values are declared under
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }` **and** under
`:root[data-theme="dark"]`, so an explicit choice beats the OS setting in both directions. An inline
script in the root layout sets `data-theme` before hydration, so there is no flash of the wrong
theme.

### 6.4 UI kit

Hand-built in `frontend/src/components/ui/`, exported from `index.ts`, with no Radix or shadcn
(same decision as the reference: full control of the look, no dependency's markup to fight).
**Pages and feature components are composed only from kit components.** A raw `<button>`,
`<input>` or ad-hoc styled `<div>` card in a feature is a review failure; if the kit lacks
something, extend the kit first.

Every interactive component implements its WAI-ARIA pattern (roles, keyboard navigation, focus
management and focus return), and its colocated test covers keyboard behaviour, not just rendering.

**Built in BS-2** (all exported from `@/components/ui` and shown on `/design-system`):

- **Primitives**: Button (+ `buttonVariants`), IconButton (with count badge), Icon (lucide-react at
  token sizes, hidden from assistive tech unless labelled), TextLink, ButtonLink, Badge, Avatar
  (initials fallback), Kbd, VisuallyHidden, Spinner, Skeleton
- **Forms**:
  - FormField (+ `useFormFieldControl`, which wires label, hint, error, `aria-describedby`,
    `aria-invalid` and `required` through context)
  - Label, Input (leading/trailing adornments), Textarea (character counter)
  - **Select (a styled native `<select>`)**
  - Checkbox (indeterminate state), RadioGroup (list, or selectable cards with an aside such as a
    price; the aside wraps under the label on narrow phones)
  - Switch, QuantityStepper, PasswordInput
- **Feedback**:
  - Alert, Toast (+ `ToastProvider`/`useToast`)
  - Modal: a **bottom sheet on phones**, centred from `sm` up
  - Drawer (right, left or bottom), ConfirmDialog (focus starts on Cancel)
  - Tooltip, ProgressBar, EmptyState
- **Navigation**: Tabs (underline or pills; scrolls sideways on phones), Breadcrumbs, Pagination
  (compact "Page x of y" on phones), DropdownMenu, ThemeToggle (inline segmented radios)
- **Data display**:
  - Card (+ CardHeader, CardFooter)
  - **BookCover**: a 2:3 cover with spine crease, page block and warm resting shadow; turns on hover
    on pointer devices; falls back to a typographic cover sized in container units
  - **BookCard**: the whole card is one link, named by the title
  - **PriceTag**: "now/was" wording for screen readers, % off, trims ".00" except with `exact`
  - Rating (partial stars), RatingInput, Accordion (`inert` when collapsed, so it can animate)
- **Layout**: Container, Section (eyebrow/title/intro/actions header), Eyebrow, Divider
- **Shared behaviour**:
  - `use-dialog.ts`: moves focus in, traps Tab, closes on Escape, returns focus, and uses a
    ref-counted scroll lock that is safe for nested dialogs
  - Portal / `useMounted`

**Decision: `Select` is a styled native `<select>`, not a custom listbox.** This changes the
original plan. Most buyers are on phones, where the OS picker is faster and more familiar than any
custom listbox, and it is accessible without extra work. A custom Combobox gets built only when a
screen needs search-as-you-type (e.g. a long country list in BS-7).

**Added later, when a real screen needs them:**
- Combobox, MoneyInput, Table/DataTable (admin)
- OtpInput and a password strength meter (BS-4)
- Stepper/Timeline (checkout and shipment, BS-7 and BS-9)
- StatCard (BS-12)
- Header and MobileNav shells (BS-5)

Reference-project lessons baked in:
- Overlays that position themselves clamp to the viewport after measuring.
- Never nest a portal-based control (DropdownMenu, Tooltip) inside a Modal/Drawer: the modal
  backdrop paints over it. Use an inline control.
- Touch targets are 44px for standalone icon actions and at least 36px in dense rows.
- `/design-system` (not indexed) renders every token and every component in both themes. It is
  the visual regression reference.
- **Long words must never widen the page** (found in BS-2). An unbreakable word ("Thermodynamics"
  at display size) made the layout viewport 397px wide on a 375px phone, so the phone zoomed out and
  the bottom sheet slid off-screen. Headings now use `overflow-wrap: anywhere; hyphens: auto`
  globally, and `npm run check:responsive` fails whenever the layout viewport is wider than the
  device.

## 7. Frontend architecture

```
frontend/src/
├── app/
│   ├── (store)/            home, /books, /books/[slug], /books/[slug]/read (preview reader), /authors/[slug], /cart, /checkout, /checkout/callback
│   ├── (auth)/             /login, /register, /forgot-password, /reset-password, /verify-email, /claim-account
│   ├── account/            orders, library (read online + downloads), messages, addresses, profile, security
│   ├── admin/              dashboard, books, orders, payments, refunds, customers, coupons, shipping, messages, settings
│   ├── design-system/
│   ├── sitemap.ts, robots.ts
├── components/ui/          the UI kit (§6.4)
├── components/layout/      header, footer, mobile nav (composed from the kit)
├── features/<domain>/      feature components, hooks, Zod schemas (e.g. features/reader/: the pdf.js reader, §10)
├── lib/api/                RTK Query `api` instance + injected endpoint files + types
├── lib/redux/              store, typed hooks, slices (session, theme, currency)
├── lib/                    money formatting, currency detection, utilities
└── styles/                 tokens.css, tokens.ts
```

- **Rendering**: catalogue pages (home, book list, book detail, author) are **server components**
  fetching from the API with `revalidate` tags (fast first paint and SEO). Cart, checkout, account
  and admin are client components using RTK Query.
- **Data**: one RTK Query `createApi` instance with `baseUrl: '/api'` (the same-origin proxy).
  Features call `api.injectEndpoints()`. Server data never goes into plain slices. The base query
  retries once after a silent refresh on 401 (except on the auth endpoints), guarded by the shared
  mutex (§5).
- **RTK Query rules from the reference**: always `try/catch` around `await queryFulfilled` in
  `onQueryStarted`, and never send a form's values object straight to a mutation (build the payload
  explicitly, because `forbidNonWhitelisted` rejects any extra field).
- **Currency**: the `currency` slice is initialised from the `x-vercel-ip-country` header (NG → NGN,
  GB → GBP, euro-area → EUR, otherwise USD), persisted in a cookie, and switchable in the header.
- **SEO**: `generateMetadata` per book, JSON-LD `Book` + `Offer` + `AggregateRating`, canonical
  URLs, `sitemap.ts`, Open Graph images generated from the cover.

## 8. Commerce and money safety

This section is the heart of the system. **Every rule here has a test** (docs/ENGINEERING_RULES.md
§6).

### 8.1 Money primitives

- `Money = { amount: number /* integer, minor units */, currency: 'NGN' | 'USD' | 'GBP' | 'EUR' }`.
- `common/money/` holds the only code that does money arithmetic: add, subtract, multiply by
  quantity, percentage discount (rounded **half-up to the minor unit, once, on the discount
  total**), minor↔major conversion per provider, and a currency-exponent table. Mixing currencies
  throws.
- **Per-currency list prices**: the lecturer sets an explicit price in each enabled currency. There
  is no runtime FX, so the price a customer sees is exactly what they pay, and the price the
  provider charges is exactly what we stored.
- **Prices are tax-inclusive.** `taxTotal` is 0 in v1 and kept on the schema. See PRODUCT_RULES §9
  for the open question on EU/UK digital VAT.

### 8.2 Checkout flow

1. **Quote**: `POST /checkout/quote` takes `{ items, currency, shippingCountry?, couponCode? }` and
   returns priced lines, shipping, discount and total, all **computed on the server from the
   catalogue**. The client's numbers are only ever for display.
2. **Place order**: `POST /orders` with an `Idempotency-Key` header, which becomes `checkoutKey`
   (unique). Guests include `email` and `name`, and a matching `unclaimed` user is found or created.
   A guest checkout with the email of an existing **claimed** account is allowed; the order attaches
   to that account and the receipt email tells them to log in to see it (we don't leak that the
   account exists at checkout). Inside **one MongoDB transaction**:
   - re-quote from the catalogue (the same function as step 1);
   - reserve print stock (§8.3); if it fails, abort with a clear message;
   - reserve the coupon redemption;
   - reject ebooks the buyer already owns;
   - create the order as `pending_payment` with `expiresAt = now + 30 min`.
   A retried request with the same key returns the same order instead of creating a second one.
3. **Initiate payment**: `POST /payments/initiate` with `{ orderId, provider }`. It checks that the
   order is `pending_payment`, not expired, and that the provider supports the currency (§9.2). It
   creates a `payments` document with **our own reference**, then calls `adapter.initiate()` with
   the exact `order.total`, and returns the hosted-checkout URL. Stock and coupon are already held.
4. **Pay** on the provider's hosted page (Stripe Checkout, Paystack Standard, Flutterwave
   Standard). **Card data never touches our servers** (PCI SAQ-A).
5. **Return**: the provider redirects to `/checkout/callback?reference=…`. The page calls
   `POST /payments/verify { reference }`, which asks the provider directly (§8.5), then polls the
   order until it reaches a final state. The page shows success, "still confirming" (with
   reassurance and live updates) or failure with a "try again / use another method" option.
6. **Webhooks** arrive independently (§9.3). Whichever of verify and webhook arrives first settles
   the payment; the other is a no-op.

### 8.3 Stock reservation

- Reserve: `updateOne({ _id, 'formats.type': 'print', $expr: stockOnHand − stockReserved ≥ qty },
  { $inc: { 'formats.$.stockReserved': qty } })`. If it matches nothing, the stock is gone. This
  runs inside the order transaction.
- Commit on payment: `$inc { stockReserved: −qty, stockOnHand: −qty }`.
- Release on expiry or cancel: `$inc { stockReserved: −qty }`, guarded by the order's own state
  transition so it can only run once.
- Ebooks have no stock.

### 8.4 Order state machine

```
pending_payment ──paid──▶ paid ──(all ebooks granted + shipment delivered/not required)──▶ fulfilled
      │                     │
      ├──expired (30 min, no successful payment)
      └──cancelled (by customer/admin before payment)

paid / fulfilled ──refund──▶ partially_refunded ──▶ refunded
```

- Transitions live in `orders/order-state-machine.ts` (a pure function with an exhaustive table and
  unit tests). Every write is a **conditional atomic update** (`findOneAndUpdate({ _id, status:
  <expected> }, …)`), so two concurrent actors can't both win.
- **A late successful payment on an `expired` order is never ignored.** Settlement re-reserves
  stock. If it can't (print sold out), the order becomes `paid` with `attention.required = true` and
  the owner is alerted to ship later or refund. Ebook-only orders always fulfil.

### 8.5 Settlement: the one function that marks money as received

`PaymentsService.settle(reference, providerResult)` is the **only** code path that moves a payment
to `succeeded` or an order to `paid`. It is called by verify, the webhook and the reconciliation
job. Steps:

1. Load the payment by **our** reference. An unknown reference is logged and ignored.
2. Check that the provider matches `payment.provider`. A mismatch is ignored and logged.
3. If the provider reports failure or abandonment, mark the payment `failed` only if it is still
   `initiated` (never downgrade a success), and leave the order `pending_payment` so the buyer can
   retry.
4. **Assert `verifiedAmount === payment.amount` and `verifiedCurrency === payment.currency`.** On a
   mismatch, set `reconciliationRequired`, raise order `attention`, alert the owner, and **do not
   mark paid**. This check is new compared with the reference project.
5. In **one transaction**:
   - conditionally move the payment `initiated → succeeded`;
   - conditionally move the order `pending_payment|expired → paid`;
   - commit stock;
   - mark the coupon redemption `redeemed`;
   - create ebook entitlements;
   - create the shipment record;
   - **enqueue emails in the outbox** (receipt, library-ready, owner "new sale" notice), each with a
     `dedupeKey`;
   - write an audit entry.

   The partial unique index in §4.3 is the final guard against a double success.
6. After commit: emit realtime events. If step 5 lost the race (another path already settled), it
   commits nothing and returns the current state.

Because emails go through the outbox **inside the same transaction**, "paid but no receipt sent"
and "receipt sent but not paid" are both impossible.

### 8.6 Reconciliation and expiry jobs

- **Every 5 minutes**: payments still `initiated` for more than 10 minutes and less than 48 hours
  are checked with `adapter.verify()` and passed to `settle()`. This rescues payments whose webhook
  never arrived.
- **Every minute**: orders in `pending_payment` past `expiresAt`, **with no payment in `initiated`
  state younger than 15 minutes**, move to `expired`, releasing stock and the coupon. The 15-minute
  grace stops us expiring an order while its buyer is on the provider's page.
- Jobs use a Mongo-based lease lock (`job_locks`, TTL) so multiple API instances never run the same
  job at once.

### 8.7 Refunds

- Admin-only (`owner` for amounts above a threshold set in `settings`), full or partial, with a
  required reason and an audit entry.
- **Two-phase**: atomically append a `pending` refund (checking that the refundable balance is
  still sufficient), call `adapter.refund()` with a refund idempotency key, then record the result.
  - A confirmed provider rejection removes the claim.
  - An **ambiguous outcome** (timeout, 5xx) sets the refund to `outcome_unknown` and
    `reconciliationRequired`, and is **never retried automatically**. An admin checks the provider
    dashboard and resolves it.
  - Provider refund webhooks confirm `pending` refunds.
- A full refund revokes ebook entitlements; print restocking is an explicit admin choice.
- Refunds or disputes made **outside** the app (in a provider dashboard, or a chargeback) are
  detected from webhooks and recorded, and flag the order for attention.

## 9. Payment providers

### 9.1 Adapter interface

```ts
interface PaymentAdapter {
  initiate(p: { reference; amount: Money; customer: { email; name }; orderNumber;
                successUrl; cancelUrl; metadata }): Promise<{ redirectUrl; providerTransactionId? }>;
  verify(reference: string): Promise<ProviderResult>;       // server-to-server, secret key
  parseWebhook(rawBody: Buffer, headers): Promise<WebhookEnvelope | null>; // null = bad signature / irrelevant
  refund(p: { providerTransactionId; amount: Money; idempotencyKey }): Promise<RefundResult>;
}
type ProviderResult = { reference; status: 'succeeded' | 'failed' | 'pending';
                        amount: Money; providerTransactionId };
```

Checkout, webhook and refund code never branch on provider name outside `PaymentsService`'s
adapter registry.

### 9.2 Routing

| Currency | Default | Alternatives |
|---|---|---|
| NGN | Paystack | Flutterwave, Stripe |
| USD, GBP, EUR | Stripe | Flutterwave |

This is a config table in `payments/provider-resolver.ts`, filtered by the per-provider enable
switches in `settings`. The buyer sees the default preselected and can switch.

### 9.3 Provider specifics

| | Stripe | Paystack | Flutterwave |
|---|---|---|---|
| Hosted page | Checkout Session | `transaction/initialize` → `authorization_url` | Standard (`/v3/payments`) → `link` |
| Our reference goes in | `client_reference_id` + `metadata.reference` | `reference` | `tx_ref` |
| Amount unit sent | minor | minor (kobo) | **major** (the adapter converts, with tests) |
| Webhook signature | `stripe-signature`, `constructEvent` with `STRIPE_WEBHOOK_SECRET`, 5-min tolerance | `x-paystack-signature` = HMAC-SHA512(raw body, secret key), compared with `timingSafeEqual` | `verif-hash` header equals `FLUTTERWAVE_WEBHOOK_HASH` (timing-safe); **the event is then re-verified with `GET /transactions/:id/verify`** because the hash only proves the sender knows a shared secret |
| Events acted on | `checkout.session.completed`, `checkout.session.async_payment_*`, `charge.refunded`, `charge.dispute.created` | `charge.success`, `refund.processed`, `refund.failed` | `charge.completed`, refund events |
| Verify call | `checkout.sessions.retrieve` (+ PaymentIntent) | `GET /transaction/verify/:reference` | `GET /transactions/verify_by_reference?tx_ref=` |

Webhook routes: `POST /payments/webhooks/{stripe|paystack|flutterwave}`, all `@Public()`, excluded
from throttling, read from `req.rawBody`. They **always return 2xx** once the signature is checked,
even for ignored events: providers disable endpoints that keep returning 5xx. Processing failures
are recorded in `webhook_events` and picked up by reconciliation.

**Adapter errors**: a provider's own error message about the transaction ("amount below minimum") is
passed to the buyer as a 400. Anything else is a generic message with full details in the logs.

## 10. Preview reader, online reading, ebook delivery and print fulfilment

### 10.1 Preview ("read the abstract and introduction before you buy")

The lecturer's requirement: a buyer can read the abstract and introduction of any book in the
browser, and when they want to read further they are asked to buy, smoothly and in context.

**Security principle: the browser only ever receives pages the visitor is entitled to.** Hiding or
blurring pages client-side is not protection (anyone can open dev tools). So the preview is a
**separate PDF built on the server** that physically contains only the preview pages:

1. The admin uploads the manuscript (private master PDF) and marks the preview sections in the
   book editor. The editor shows page thumbnails of the manuscript so they can pick "Abstract
   pp. 1–2, Introduction pp. 3–18", and it enforces `maxPreviewPercent`.
2. `PreviewService.generate(bookId)` (pdf-lib, runs as a background job on manuscript or section
   change):
   - copies only those pages into a new PDF, stamping a small "Preview · <title>" footer;
   - strips metadata, attachments and outline entries that point outside the preview;
   - uploads the result as the public preview asset;
   - renders the 2 blurred **locked teasers** from the next pages at ≤ 48px wide;
   - extracts the manuscript outline into `preview.outline`, marking each entry `inPreview`.
3. The preview is served through `GET /books/:slug/preview` → `{ url, pageCount, sections, outline,
   lockedTeasers, totalPages }` (`@Public()`, cached, rate-limited).

**Reader UX** (`/books/[slug]/read`, and embedded as a sheet on the book page):
- A pdf.js renderer (`pdfjs-dist` in a web worker, lazy-loaded so the book page stays fast) draws
  pages to canvas with a text layer, so the text is selectable and accessible to screen readers.
  Controls: continuous scroll, single-page or two-page spread on wide screens, zoom, fit width,
  keyboard navigation (←/→, PgUp/PgDn, Home/End), and a full-screen focus mode. The theme follows
  the site theme, with a "paper" or "sepia" canvas tint in dark mode.
- **Sidebar table of contents** shows the whole book. Preview chapters are clickable; locked
  chapters show a lock icon and open the paywall card with that chapter's name ("Chapter 4: Heat
  Exchangers is in the full book").
- **Progress bar**: "Page 14 of 18 free pages · 342 pages in the full book".
- **The paywall moment**: after the last preview page, the reader scrolls into the blurred locked
  teasers fading into an inline **"Continue reading"** card. The card shows the cover, price in the
  visitor's currency, "Ebook, instant access: continue on page 19 right after payment" and "Print
  edition, ships to <country>", buy buttons, and trust badges (secure payment via
  Paystack/Stripe/Flutterwave). A gentle, dismissible nudge also appears at 80% of the preview.
  There are no pop-ups mid-read.
- **Buying without leaving the reader**: "Buy ebook" adds the item and opens a **checkout drawer**
  over the reader (the same checkout flow, §8.2). The provider's return URL carries
  `returnTo=/books/<slug>/read?page=<n>`. After settlement the buyer lands **back in the reader in
  full mode at the page they stopped on**, with a quiet "Unlocked. Enjoy the rest of the book"
  toast. Guests get the same flow; their reading progress follows them into the account created at
  checkout (§5).
- Buying print only: the reader keeps the preview and shows "Your print copy is on its way", and
  offers an ebook add-on if enabled.
- **No login is required** to read a preview (lowest friction, and good for SEO sharing). Reading
  progress for anonymous visitors is kept under the guest cookie.
- Analytics events (`preview_events`) are batched and sent with `navigator.sendBeacon`.
- The abstract is **also** rendered as real HTML on the book page (instant, indexable, and
  accessible without loading the reader), with a "Read the introduction" button opening the reader.

### 10.2 Online reading for owners

A buyer with an ebook entitlement can read the **full** book in the same reader
(`/account/library/[bookId]/read`). `GET /library/:bookId/read` (auth, entitlement check,
rate-limited) returns a **5-minute signed URL** to their stamped copy (§10.3), fetched by pdf.js with
HTTP range requests so large books stream page by page. Progress syncs to `reading_progress`
(debounced), so they resume on any device. The reader component is the same one; `mode: 'full'`
just removes the paywall.

### 10.3 Ebook downloads

- Manuscripts are uploaded by the admin as Cloudinary **authenticated raw assets**, which are never
  publicly addressable.
- `GET /library/:bookId/download` (auth required, entitlement not revoked, rate-limited 10/hour per
  user) records a `download_event` and returns a **signed URL valid for 5 minutes**.
- If the format has `stampWithBuyer` set, the PDF is stamped on each page footer ("Licensed to
  <name> <email> · Order BS-…") with `pdf-lib` at first download. The stamped copy is cached as its
  own authenticated asset per entitlement. This discourages sharing without DRM friction.
### 10.4 Print fulfilment

- A shipment record is created on payment; an admin moves it through
  processing → shipped (carrier + tracking number) → delivered. Each step emails the buyer.

## 11. Email system

- **Provider**: Resend, with a verified sending domain (SPF, DKIM, DMARC; see DEPLOYMENT §5).
- **Templates**: React Email components in `backend/src/mail/templates/`, in brand style (the same
  colour tokens, copied as constants into `templates/theme.ts`), each with a plain-text version.
  Previewed with `npm run email:dev`.
- **Transactional outbox**: business code never calls Resend directly. It inserts an
  `email_outbox` row, inside the same transaction as the state change when there is one. A worker
  (every 10 s, lease-locked):
  - claims due rows atomically (`queued|failed`, `nextAttemptAt ≤ now` → `sending`,
    `lockedUntil = now + 2 min`);
  - sends with Resend's `Idempotency-Key` set to the outbox ID;
  - records `providerMessageId`;
  - retries with exponential backoff (30 s … 6 h) for up to 8 attempts, then marks `dead` and
    alerts the owner.
- **Dedupe**: a unique `dedupeKey`, so a replayed webhook can never send a second receipt.
- **Delivery tracking**: the Resend webhook (Svix-signed) records `delivered`, `bounced` and
  `complained`. Hard bounces and complaints add the address to `email_suppressions`; later
  non-critical emails to it are skipped. Receipts are still attempted.
- **Catalogue**:
  - Auth: verify email, welcome, password reset, claim account, new-device login, 2FA enabled.
  - Commerce: order receipt (with invoice PDF), payment failed (with retry link), ebook ready,
    shipment updates, refund issued, order expired (with "complete your order" link).
  - Messaging: new message (sent only when the recipient hasn't read it within 10 minutes; the
    outbox row uses `sendAfter` and is cancelled on read).
  - Owner: new sale, reconciliation needed, dead-letter email, low stock.

## 12. Messaging and notifications

- **Conversations** between a customer and the store staff (owner and admins share one inbox),
  optionally linked to an order. Customers start one from their account, an order page or a book
  page ("Ask the author").
- **Realtime**: one Socket.IO gateway, authenticated at handshake with the access token. Rooms are
  `user:<id>` (auto-joined), `staff` (admins and owner) and `conversation:<id>`. Events:
  `message:new`, `message:read`, `conversation:updated`, `notification:new`,
  `order:status`. After a reconnect the client rejoins its rooms and refetches the RTK Query cache
  (the reference lost room membership silently on reconnect).
- **Delivery guarantee**: messages are persisted first; the socket only speeds delivery up. The
  RTK Query cache is also refreshed on focus and reconnect, so nothing is lost if a socket event is.
- **Offline fallback**: an email notification through the outbox with `sendAfter` (§11).
- **Contact form** for visitors who aren't logged in: Cloudflare Turnstile or a honeypot plus rate
  limit, stored as `contact_requests`, with an email acknowledgement.
- **In-app notifications**: a bell with an unread count, backed by `notifications`.

## 13. Security

- Helmet, strict CORS allow-list, and `trust proxy = 1`.
- Input validation with DTOs; output uses explicit response DTOs, so `passwordHash`, token hashes
  and 2FA secrets are never serialised.
- Rich text (book descriptions) is sanitised server-side on write (an allow-list sanitiser).
- Secrets exist only in env vars; `.env*` is gitignored; Joi validates everything at boot.
- Logs redact authorization headers, cookies and provider signature headers.
- Admin actions require 2FA and are audit-logged.
- Webhook signatures are compared with `crypto.timingSafeEqual`.
- `npm audit` is clean on production dependencies at merge (CI check added in BS-14).
- Data protection: NDPA (Nigeria) and GDPR-style rights. Account data export and account deletion
  (orders are kept anonymised for accounting) are built in BS-13.

## 14. Observability

- Structured JSON logs with a request ID; every money event logs `orderId`, `paymentReference` and
  `provider`.
- Sentry (optional env, both apps) from BS-14.
- Health endpoint used by Render.
- The admin "Needs attention" queue (orders with `attention.required`, payments with
  `reconciliationRequired`, dead emails) is the operational dashboard for money problems.

## 15. Testing strategy

- **Backend unit tests** (`*.spec.ts`, colocated): pure logic such as the money utilities, state
  machine, provider routing, adapters (HTTP mocked, real signature computation) and quote
  calculation.
- **Backend service tests** against a real `mongodb-memory-server` (a **replica set** via
  `MongoMemoryReplSet` wherever transactions run). **Never mock Mongoose.**
- **Backend e2e** (`test/*.e2e-spec.ts`): boots the real `AppModule` with `setupApp(app)`. This is
  the only test that catches module-wiring and circular-dependency crashes, so it is **required
  before merging any change to module imports or constructor dependencies**.
- **Frontend**: Vitest + RTL, colocated; keyboard behaviour for interactive components; Zod
  schemas; money formatting.
- **Payment test matrix** (BS-8): see ENGINEERING_RULES §6.
- **Preview leak tests** (BS-6): generate a preview from a fixture manuscript with a unique marker
  string on every page, then assert that the preview PDF contains exactly the marked preview pages
  and **no marker from any locked page**. Also assert that the preview endpoint never returns a
  manuscript URL, and that `/library/:bookId/read` returns 403 without an entitlement.
