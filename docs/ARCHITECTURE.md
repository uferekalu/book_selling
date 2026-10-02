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
| Files | Cloudinary: public covers/images; **Cloudflare R2 (private) for book PDFs** | §10 |
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
| `uploads` | Cloudinary signed image uploads; R2 private book files (`BookFilesService`) | BS-5, BS-20 |
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
| twoFactor | `{ enabled, secretSealed, pendingSecretSealed, recoveryCodeHashes[], enabledAt, lastUsedStep }` | TOTP; seed AES-GCM sealed; **required** for `admin`/`owner` (§5) |
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

**`categories`**: `name`, `slug` (unique), `description`, `sortOrder`. Examples (the lecturer teaches foundry):
Foundry Technology, Metal Casting, Heat Treatment, Physical Metallurgy, Furnaces and Melting.

**`books`**
| Field | Type | Notes |
|---|---|---|
| title, subtitle | string | |
| slug | string | unique, stable (URLs and SEO) |
| authorIds, categoryIds | ObjectId[] | |
| description | string (sanitised rich text) | |
| tableOfContents | `{ title, children[] }[]` | |
| isbn13, edition, publishedAt, pageCount, language | | |
| cover | `{ publicId, version, width, height, crop, dominantColor, blurDataUrl }` | public Cloudinary image, 2:3 (§10.0) |
| gallery | same shape [] | sample spreads |
| abstract | string (sanitised rich text) | also rendered as HTML on the book page (SEO, instant read) |
| manuscript | `{ key (private R2 object), bytes, pages, checksum (SHA-256), uploadedAt }`; replaced files of a sold book are kept in `previousManuscripts` | **the private master PDF**: the source for the preview, online reading and ebook downloads. Required to publish, even for print-only books, so every book has a preview |
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
| teasers | `string[]`: 2 tiny, blurred JPEG data URIs of the first pages *after* the preview (48px wide, rendered at 32px then blurred; unreadable by construction) |
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

## 5. Auth and authorization (built in BS-4)

Code: `backend/src/auth/`, `backend/src/users/`, `backend/src/audit/`; frontend `src/lib/api/`,
`src/features/auth/`, `src/features/account/`. Ported from the reference project, then hardened. The
"Improved" notes mark where this differs from the reference.

**Tokens**
- **Access token**: JWT (HS256, with issuer and audience pinned), 15 minutes. Claims are `sub`,
  `email`, `role`, `mfa`, `sid` (session id) and `typ: 'access'`. The frontend keeps it **in Redux
  memory only**, never in `localStorage`.
- **Refresh token**: 256-bit random, stored as SHA-256 only (`refresh_tokens`), one document per
  rotation, grouped by `familyId`. One family is one signed-in device.
  - It is **rotated on every use**, atomically (`findOneAndUpdate` on `revokedAt: null`).
  - It lives in an `httpOnly` cookie `bs_rt`, `Path=/api/auth`, `Secure` in production.
  - **Improved: `SameSite=Strict` in every environment**, the strongest CSRF setting. This is
    possible because browsers only ever talk to the storefront's own origin (`/api/*` proxy). The
    reference needed `None` in production.
- **Reuse detection, with a grace window (improved).**
  - Replaying a rotated token **more than 30s** after rotation revokes the whole session (theft).
  - Within 30s, it's treated as a same-device race: two tabs reloading together, or a retried
    request. The session survives, and the late request gets a sibling token.
  - "Is this race?" checks whether the session was **deliberately ended** (logout, theft,
    password change), not whether it currently holds a live token. The concurrent winner may not
    have saved its new token yet. A race test caught the naive version logging two-tab users out.
- **Session hint cookie (BS-19).** `bs_session=1`: readable, secret-free, path `/`, `SameSite=Strict`,
  same expiry as the refresh cookie. It is set with every session and cleared whenever the session
  ends. The storefront restores a session only when the hint is present, so signed-out visitors see
  Sign in / Create account at once and send no refresh request.
- **No cookie is not an error.** `POST /auth/refresh` without a cookie returns
  `200 { status: 'anonymous' }`. Every page load checks for a session, and a 401 would put an
  error in every anonymous visitor's browser console. A *bad* cookie still gets 401 and is cleared.
- **Sessions are visible to the user**: `GET /auth/sessions` lists each device ("Chrome on
  Android", last active, this-device flag), `DELETE /auth/sessions/:id` signs one out, and
  `POST /auth/logout-all` signs out everywhere. Device names come from a small hand-written parser,
  because ua-parser-js 2.x is AGPL.

**Guards: default-deny.** `APP_GUARD` runs in order: throttler, `AccessTokenGuard`, `RolesGuard`.
- Every route needs a valid access token unless it is `@Public()`. Public routes still attach a
  valid token (`@OptionalUser()`) for personalisation.
- MFA challenge tokens are signed with the same key but are rejected as access tokens (`typ`).
- `@Roles('admin' | 'owner' | ...)` checks the role. **Staff roles also need an `mfa: true`
  session**. Otherwise the response is 403 with `code: 'two_factor_required'`, and the frontend
  sends them to 2FA setup.
- **Ownership is checked in services** ("is this *your* order").

**Passwords**
- bcrypt, with the cost from `BCRYPT_COST`. Env validation enforces at least **12 in production**;
  tests use 4.
- Policy (NIST 800-63B): at least 10 characters, a block on common passwords, and no email local
  part or name. Mirrored on the frontend for live feedback, with a strength meter; the server check
  is authoritative.
- Sign-in failures are generic ("Incorrect email or password") for a wrong password, an unknown
  email or an unclaimed account. Unknown emails still run a bcrypt compare against a dummy hash, so
  response time doesn't reveal which accounts exist.
- **Lockout**: 10 consecutive failures (password or 2FA code) lock the account for 15 minutes
  (429). A password reset clears the lock.

**Two-step verification (TOTP)**: `otpauth`, 30s steps, ±1 step window.
- The seed is encrypted at rest with AES-256-GCM (`TWO_FACTOR_ENCRYPTION_KEY`, `SecretBox`).
- Each time step is accepted **once** (an atomic `lastUsedStep` update, so no replay).
- Setup is three steps: confirm the password, scan the QR code (an SVG rendered as an image, on
  white even in dark mode), then save **10 single-use recovery codes** (stored hashed; copy and
  download offered).
- Staff can't turn it off. A reset link never bypasses it: after the reset, the person must sign in
  with a code.
- Enabling it upgrades the current session to `mfa: true` (`SessionService.markMfa`), so staff
  don't have to sign in again.

**Email links** (`auth_tokens`): random, hashed, **single-use**, consumed atomically, and issuing a
new one invalidates older ones. **Improved:** the reference used JWT links, which stay valid until
they expire.

| Link | Lifetime | Effect |
|---|---|---|
| verify email | 24 h | marks verified, sends welcome |
| reset password | 60 min | sets password, verifies email, revokes every session, security email, signs in (unless 2FA) |
| claim account | 7 days | as reset, plus `unclaimed` → `active` (guest checkout) |

Mail scanners can't consume a link: the verify page POSTs the token from the browser, not on GET.
Token pages send `Referrer-Policy: no-referrer` and are `noindex`.

**Account states and roles**
- Registration gives `customer`, with **terms version and acceptance time recorded**, and marketing
  opt-in only by explicit tick, timestamped (NDPA/GDPR consent evidence).
- Registering with a **guest's** email never sets a password from an unverified request. It emails
  a claim link instead (`202 claim_email_sent`); otherwise anyone could take over a guest's library.
- `UsersService.findOrCreateForGuest` (used by BS-7) is an idempotent upsert.
- The owner is bootstrapped once per environment with `npm run seed:owner -- email`. The owner
  grants and removes `admin` (`PATCH /users/:id/role`), which revokes the target's sessions and
  writes an audit entry. The owner role itself can't be granted through the API.

**Security emails** (`auth.security-notice`): sign-in from a new kind of device, password changed,
2FA on or off.

**Audit log** (`audit_logs`, global `AuditService`): role changes, 2FA changes, recovery code use.
Append-only.

**Frontend session handling**
- `SessionBootstrap` restores the session once per page load through
  `restoreSession`, a `queryFn` that takes `refreshMutex` itself.
- `baseQueryWithReauth`: on a 401 (except on auth endpoints), one shared renewal, then a retry.
- `renewSession()` uses the raw base query. Going through the wrapper would wait on the lock its
  caller holds: the self-deadlock the reference shipped.
- Tests cover: renew and retry; 5 concurrent 401s giving **1** refresh; a failed renewal signing
  out; an anonymous reply; sign-in errors never triggering a refresh.
- Signed-in pages use `RequireAuth`, which shows a skeleton while checking, then redirects to
  `/login?next=…`. `next` is sanitised by `safeNextPath` (same-site relative paths only, so no open
  redirect).

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
│   ├── (site)/             everything with the site header and footer:
│   │   ├── page.tsx, books/, books/[slug]/, authors/, authors/[slug]/   storefront (server components, BS-5)
│   │   ├── account/        profile, addresses, security (BS-4); orders, library, messages later
│   │   ├── admin/          books, books/[id] (editor), authors, categories (BS-5); orders, payments… later
│   │   └── legal/, not-found.tsx
│   ├── (auth)/             /login, /register, /forgot-password, /reset-password, /verify-email, /claim-account
│   ├── internal/revalidate/ POST hook the API calls after catalogue edits (shared secret)
│   ├── design-system/
│   ├── sitemap.ts, robots.ts
├── proxy.ts                (Next 16's middleware) sets the currency cookie on a first visit
├── components/ui/          the UI kit (§6.4)
├── components/layout/      header, footer, mobile nav (composed from the kit)
├── features/<domain>/      feature components, hooks, Zod schemas (e.g. features/reader/: the pdf.js reader, §10)
├── lib/api/                RTK Query `api` instance + injected endpoint files + types
├── lib/redux/              store, typed hooks, slices (session, theme, currency)
├── lib/                    money formatting, currency detection, utilities
└── styles/                 tokens.css, tokens.ts
```

- **Rendering**: catalogue pages (home, book list, book detail, author) are **server components**
  fetching from the API through `lib/catalog.ts` (`server-only`): `cache: 'force-cache'` plus tags
  (`catalog`, `book:<slug>`, `author:<slug>`) and a 5-minute expiry as a safety net. After every
  admin edit the API calls `POST /internal/revalidate` (shared secret `REVALIDATE_SECRET` =
  backend `FRONTEND_REVALIDATE_SECRET`, compared in constant time), which expires those tags
  immediately, so changes appear at once. If the API is unreachable, pages render a friendly
  "unavailable" state (`orFallback`) instead of an error page. Cart, checkout, account and admin
  are client components using RTK Query. Listing state (search, subject, format, sort, page) lives
  in the URL, so results are shareable and the back button works.
- **Data**: one RTK Query `createApi` instance with `baseUrl: '/api'` (the same-origin proxy).
  Features call `api.injectEndpoints()`. Server data never goes into plain slices. The base query
  retries once after a silent refresh on 401 (except on the auth endpoints), guarded by the shared
  mutex (§5).
- **RTK Query rules from the reference**: always `try/catch` around `await queryFulfilled` in
  `onQueryStarted`, and never send a form's values object straight to a mutation (build the payload
  explicitly, because `forbidNonWhitelisted` rejects any extra field).
- **Currency** (as built): `proxy.ts` sets the `bs_currency` cookie on a first visit from the
  `x-vercel-ip-country` header (NG → NGN, GB → GBP, euro area → EUR, otherwise USD), falling back to
  the `Accept-Language` region locally. Server components read it (`lib/request-currency.ts`); the
  header/drawer switcher rewrites the cookie and calls `router.refresh()`. It is a cookie, not a
  Redux slice, because the server renders the prices.
- **Images**: `next/image` with a custom loader (`lib/cloudinary-loader.ts`) that inserts
  `w_<width>,c_limit,q_auto,f_auto` after the stored crop, so Cloudinary serves AVIF/WebP at the exact
  size each screen needs. The cover's blur placeholder and dominant colour show while it loads.
- **SEO**: `generateMetadata` per book and author (canonical URL, Open Graph image from the cover),
  JSON-LD `Book` + `Offer` (+ `AggregateRating` once reviews exist) and `Person`, `sitemap.ts`
  (published books, subjects with books, authors, legal pages) and `robots.ts` (account, admin,
  checkout and internal paths disallowed). Renamed books 308-redirect from their old slugs.

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

**As built (BS-7)**, in `backend/src/commerce`:
- **One pricing function** (`pricing.ts`, pure): the cart view, `POST /checkout/quote` and order
  placement all call `priceCart`, so "Review & pay" shows exactly what is charged. It prices the
  **server-side cart** (the client never sends items or prices to the quote), excludes unavailable,
  unpriced, owned or out-of-stock lines with a reason, caps print by stock left and `maxPerOrder`,
  adds shipping (first copy + each additional, per currency, by zone; "everywhere else" zone `*`),
  applies one coupon once on the eligible item subtotal (never on shipping) and refuses a zero
  total. All arithmetic goes through `common/money/money.ts`.
- **Carts** store items only (`seenAmount` is kept solely to say "the price changed since you
  added it"). Guests get an httpOnly `bs_cart` cookie (`SameSite=Lax`, path `/api`, 30 days);
  signing in merges the guest cart into the account on the next cart read. Cart, quote and
  place-order routes use `@OptionalAuth()`: guests are welcome, but a stale token gets 401 so the
  client renews it instead of silently showing a signed-in buyer a guest cart.
- **Idempotency key = guest access**: `POST /orders` requires an `Idempotency-Key` (≥ 22 random
  URL-safe characters, generated per order details by the browser). Only its SHA-256 is stored
  (`checkoutKeyHash`, unique). A retry returns the same order (200), concurrent duplicates collapse
  on the unique index, and the same key from a different buyer is refused (409). A guest views or
  cancels their order by proving the key in a request **body** (`/guest-orders/lookup`,
  `/guest-orders/cancel`), never a URL, so it never appears in logs.
- **Placement transaction**: buyer (signed in, or guest found-or-created as `unclaimed`) →
  re-quote with the session → reject problems and an inapplicable coupon the buyer typed → **one
  open checkout per buyer**: any older `pending_payment` order is cancelled and its holds released
  → hold print stock with an **optimistic exact-match update** (the stock values just read must be
  unchanged, so concurrent checkouts can't oversell) → hold the coupon (conditional
  `redemptionCount < maxRedemptions` increment + a `reserved` redemption) → order number from an
  atomic counter (`BS-2026-000123`) → order `pending_payment`, `expiresAt = now + 30 min`. The
  order's totals invariant is asserted on every save. On a standalone MongoDB (no transactions)
  checkout answers 503 with a clear log line (DEPLOYMENT §2).
- **The cart is kept until payment succeeds** (cleared by settlement in BS-8), so an expired or
  cancelled order loses nothing.
- **Closing** (`cancel` by the customer, `expire` by `OrderExpiryJob` every minute): a
  conditional status update, then stock and coupon released, all in one transaction, so holds are
  released exactly once. Expiry also queues one "complete your order" email inside the same
  transaction (dedupe key per order).
- **BS-8 must add**: expiry and the one-open-checkout rule skip orders with a payment attempt
  started in the last 15 minutes; settlement clears the cart and handles a late payment on an
  expired/cancelled order (the state machine already allows it).
- Accepted trade-off: for a guest, "already in your library" is checked against the account with
  that email, which tells whoever types that email whether it owns the ebook. Low sensitivity, and
  it prevents a second charge for a book the person already has.

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

**As built (BS-8)** in `backend/src/payments`:
- **Reference**: `BSP-` + 32 hex characters (random 128 bits). Hex rather than a ULID because
  Paystack allows only letters, digits, `-`, `.` and `=` in references.
- **Initiate** (`POST /payments/initiate`, `@OptionalAuth`; a guest proves access with their checkout
  key in the body): order must be `pending_payment` and inside its window; the provider must be
  enabled and route the currency; at most 10 attempts per order. Our payment row is written
  **before** calling the provider, for the exact `order.total`. A provider refusal is shown to the
  buyer (400); an unreachable provider is a 503 with "try again or choose another method". Starting
  a payment moves no money, so a failed start is simply closed.
- **Verify on return** (`POST /payments/verify { reference }`, public, rate-limited) re-asks the
  provider server-to-server and settles; the page polls it (every 3 s for about 2 minutes, then
  "we'll email you"). Failed attempts are re-verified too (a bank can confirm after a decline).
- **settle()** in order: unknown reference → ignored; provider mismatch → ignored; `pending` →
  nothing; `failed` → only `initiated → failed` (a success is never downgraded); succeeded →
  **amount and currency must equal the payment exactly, else `reconciliationRequired`, order
  `attention`, owner alerted, not paid** → one transaction: payment `initiated|failed|abandoned →
  succeeded` (conditional) · order `pending_payment|expired|cancelled → paid` (conditional) · stock
  committed (held) or **taken again for a late payment, else the order is paid and flagged "ship
  later or refund"** · coupon redeemed (taken again if its hold was released) · ebook entitlements
  (an ebook already owned through another order is flagged, not granted twice) · purchased lines
  removed from the buyer's cart · receipt, owner "new sale" and any attention email queued in the
  outbox in the same transaction. After commit: audit entry, and the "set your password" link for a
  guest's unclaimed account. The unique index refuses a second settled payment per order; that case
  is flagged "refund this payment in the provider dashboard".
- **Webhooks** (`POST /payments/webhooks/:provider`): signature over the raw body first (401 when
  missing or wrong); then the event is recorded in `webhook_events` (unique per provider and event
  id: a redelivery is a no-op) and processed; processing errors are stored and answered 200.
  Flagged payments are left to the owner: reconciliation neither re-checks nor abandons them.
- **Refunds** (`POST /admin/orders/:n/refunds`, **owner only** until BS-12's threshold): the claim
  is one atomic update whose filter checks that `amount − (pending + succeeded + unknown refunds)` is
  at least the request, so concurrent refunds can never exceed the payment. Stripe receives our
  refund id as its idempotency key; Paystack and Flutterwave have no such key, which is one more
  reason an unknown outcome is never retried automatically. Refund webhooks confirm pending
  refunds; a refund made in a dashboard is recorded and flagged (Stripe via `charge.refunded`'s
  running total, Paystack via `refund.processed`). **Not detected automatically: Flutterwave
  dashboard refunds** (it has no reliable refund webhook); refund Flutterwave orders from the admin.
  A full refund revokes the order's ebooks.
- **Disputes** (Stripe `charge.dispute.created`, Paystack `charge.dispute.create`) flag the order
  and email the owner.
- **Configuration**: `PAYMENTS_MODE` (`test`/`live`) and per-provider keys; the API refuses to
  boot when a key doesn't match the mode or a provider's webhook secret is missing. A provider is
  offered only when configured (launching without Stripe = leaving its keys empty). Logs redact
  provider signatures, the Idempotency-Key header and Set-Cookie.

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

### 10.0 Adding a book: upload, storage and presentation (built in BS-5)

Images live in **Cloudinary** (public, resized on the fly). Book files live in **Cloudflare R2**
(private object storage, S3-compatible), because Cloudinary caps each file by plan (10MB free,
20MB Plus, 40MB Advanced) and textbooks are often 30–200MB. R2 has no per-file cap that matters
here, the first 10GB are free and downloads cost nothing (BS-20).

| File | Who may see it | Where | Path |
|---|---|---|---|
| Cover, gallery spreads, author photo | everyone | Cloudinary `upload` (public, CDN-cached) | `<CLOUDINARY_FOLDER>/books/<bookId>/images`, `…/authors/<id>` |
| **Manuscript** (the full book PDF) | **nobody directly**: our server, and staff through 30-minute signed links | R2, private bucket | `<R2_FOLDER>/books/<bookId>/manuscript/<random>.pdf` |
| Generated preview PDF | everyone (it only contains free pages) | MongoDB GridFS, served by our API (§10.1) | |
| Blurred locked-page teasers | everyone (unreadable 48px images) | inline data URIs on the book (§10.1) | |
| Per-buyer stamped ebook copies (BS-9) | only that buyer, through signed links | R2, private bucket | |

**Images: direct signed uploads to Cloudinary.**
1. The admin picks a file in the book editor.
2. The browser asks our API for an upload signature: `POST /uploads/signature` with
   `{ kind: 'cover' | 'gallery' | 'author-photo', ownerId }` (admin plus 2FA; the book or author
   must exist).
3. The API signs **only** that folder (`<CLOUDINARY_FOLDER>/books/<id>/images` or
   `/authors/<id>`), delivery type, allowed formats, the `pending` tag and no-overwrite. Cloudinary
   accepts a signature for an hour; the browser fetches a fresh one if a long upload outlives
   50 minutes. The Cloudinary secret never leaves the server.
4. The browser uploads **straight to Cloudinary** (`uploadFile` in `lib/upload.ts`) with a progress
   bar and a cancel button. Files over 6MB go in 6MB chunks; a dropped connection or a 5xx retries
   that chunk up to 3 times with backoff, while a 4xx stops at once with Cloudinary's message.
5. The browser sends the resulting `public_id` to the API, which **verifies the asset with
   Cloudinary's Admin API** before attaching it: that it exists, sits in the expected folder, has
   an allowed format, and fits the size (`IMAGE_MAX_MB`, default 10, the free plan's limit) and
   dimension rules.

**Book PDFs: direct multipart uploads to R2** (BS-20; `BookFilesService`, `ManuscriptsService`,
`uploadInParts` in `lib/upload.ts`):
1. `POST /admin/catalog/books/:id/manuscript-uploads { bytes }` (staff with 2FA): the API checks
   the book exists and the size is within `MANUSCRIPT_MAX_MB` (default 200, refused with 413
   before anything is sent), opens an R2 multipart upload under a fresh random key in this book's
   folder, and records it in `manuscript_uploads` (key, upload id, declared size, part count).
2. The browser asks for signed part URLs in batches (`…/manuscript-uploads/parts`, up to 50 at a
   time, each valid for an hour; the upload must belong to this book) and PUTs the file **straight
   to R2** in 8MB pieces, three in parallel. A dropped piece is retried on its own (4 attempts with
   backoff); a 403 (link expired, e.g. a laptop that slept) gets a fresh link; parallel pieces share
   one signing request. The SDK is set to `requestChecksumCalculation: 'WHEN_REQUIRED'` so the
   signed URLs never demand checksum headers a browser can't send. The R2 secret never leaves the
   server and the bytes never pass through our API.
3. `…/manuscript-uploads/complete`: the API lists the parts **R2 actually holds** (never the
   browser's word), checks every piece is there at the exact size the declared total implies, and
   joins them. A gap is refused (`upload_incomplete`) with the upload left open for a retry.
   Completing twice is harmless. Cancelling (`…/abort`) aborts the upload and deletes the record.
4. `POST /admin/catalog/books/:id/manuscript { key }`: the API **downloads the finished file and
   reads it itself**: the key must be one recorded for this book, the size within the limit, the
   bytes must start like a PDF and open with pdf-lib (encrypted and damaged files are refused with
   the editor's own wording). A refused file is deleted at once. The page count and a **SHA-256**
   of the content are stored; the same content uploaded again changes nothing.
5. Replacing the file: if the book was ever on sale (`listedAt`), the old file is kept in
   `previousManuscripts` (buyers' copies came from it; BS-9 moves them over); a never-sold
   draft's old file is deleted. Deleting a draft deletes all its files.

**Abandoned uploads** (`UploadCleanupJob`, hourly, job-locked) are cleaned in both stores after 24
hours: Cloudinary images still tagged `pending` (only this environment's `CLOUDINARY_FOLDER`), and
`manuscript_uploads` records never attached (the multipart upload is aborted and anything that
reached R2 deleted; R2 failures keep the record for the next run). Before deleting, the job checks
the database: an image or file a book still references is kept, and its bookkeeping fixed.

**Cover images** (presentation is what sells the book):
- Rules: JPG/PNG/WebP, at least 1200×1800px, at most `IMAGE_MAX_MB` (15MB). The editor reads the
  image size **before uploading** and refuses one too small, then opens a **2:3 cropper** (zoom and
  position sliders, thumb-friendly; the zoom stops before the crop drops below 1200px wide). The
  preview shows exactly the region sent as the crop, and the API checks it is inside the image and
  2:3, so the title is never cut off by automatic cropping later.
- Stored on the book: `{ publicId, version, width, height, crop, dominantColor, blurDataUrl }`.
  - `blurDataUrl` (a ~20px image, base64) gives an instant blurred placeholder while the real
    cover loads.
  - `dominantColor` tints the card background so the grid looks designed even before images load.
- Delivered through a **Cloudinary loader for `next/image`**: `f_auto,q_auto` (AVIF/WebP chosen per
  browser), exact responsive widths (1x/2x for retina phones), and the stored crop. The versioned
  URL means a replaced cover shows up immediately everywhere. A 2:3 cover card on a phone is
  typically 15–30KB.
- Open Graph and social-share images are generated from the cover (BS-13).

**The manuscript PDF**:
- Stored privately in R2. It is never publicly addressable, never linked from any public page, and
  its key or a link to it is never sent to visitors or buyers. Staff get a 30-minute signed link
  (`GET /admin/catalog/books/:id/manuscript-link`, 2FA) for the preview page picker; buyers get
  personal copies from BS-9.
- The manuscript is the single source for the preview (§10.1), online reading (§10.2) and
  downloads (§10.3). Upload once, and all three stay in sync.
- **A manuscript with buyers is never deleted** (`previousManuscripts` above). Archiving a book
  hides it from the store but keeps every buyer's library working. Replacing a manuscript (a
  corrected printing) creates a new version; existing buyers get the new version, plus an "updated
  edition" email (BS-9).
- **Size and memory**: `MANUSCRIPT_MAX_MB` (default 200) is bounded by the API's memory, not by
  storage: attaching and building a preview hold the whole PDF in memory several times over, so
  the Render instance needs about 4× the largest book (DEPLOYMENT §4a).

**The admin "Add a book" flow** (BS-5 + BS-6), as built: **one page with every section stacked**
(not a wizard), each section saving on its own with an "Unsaved" badge, a "Discard changes"
button and a browser warning before leaving with unsaved edits. Explicit saves were chosen over
autosave: a half-typed price or slug is never published by accident, and on a phone it is clear
what has been saved. The status card (checklist, Publish, Unpublish, Archive, Delete draft) sits
beside the form on desktop and above it on phones. Markdown fields have a Preview tab rendered by
`POST /admin/catalog/markdown-preview` through the same sanitizer the store uses. Prices are typed
in major units and parsed to integer minor units **as strings** (`parseMajorToMinor`), never with
floating-point maths. The table of contents is typed as text, one line per entry (indent for a
section, page number at the end), which is how authors already have it. Sections:
1. **Details**: title, subtitle, web address (slug; renaming keeps the old link as a redirect),
   author(s), subjects, ISBN-13 (check digit validated in the browser and by the API), edition,
   publication date, pages, language, keywords, "feature on the home page", and the optional
   search-engine title and description.
2. **Abstract & description**: Markdown with a live, sanitised preview; the abstract shows a
   character count until it reaches the 80-character minimum; the table of contents as text.
   (Pre-filling the contents from the PDF's outline is a later improvement.)
3. **Cover & sample pages**: tap-to-pick or drag-and-drop, size check before upload, 2:3 crop,
   optional alt text; up to 8 sample pages, each removable.
4. **Book file**: chunked, resumable upload with progress and cancel; pages and size shown after
   the checks. Replacing the file of a book already sold explains what happens to buyers.
5. **Preview** (BS-6): pick the abstract and introduction pages from thumbnails, with the 15% cap
   enforced; see exactly what visitors will see.
6. **Formats & prices**: ebook and/or print, a price per currency (NGN, USD, GBP, EUR), an optional
   sale ("was") price that must be higher, per-copy buyer stamping for ebooks, print stock (never
   below copies held by unpaid orders), weight and per-order limit.
7. **Status card**: the **publish checklist** (each item links to its section), Publish,
   Unpublish, Archive and Delete draft. Publish stays disabled while any section has unsaved edits
   and until every rule in PRODUCT_RULES §3 passes: cover, abstract, description, manuscript,
   preview, and a price in every currency for each format on sale. The API enforces the same
   checklist and returns it as `problems` if publishing is refused.

**Backups**: the owner keeps the original manuscript files. R2 stores data redundantly, but it is
the delivery store, not the only copy of the author's work.

### 10.1 Preview ("read the abstract and introduction before you buy")

The lecturer's requirement: a buyer can read the abstract and introduction of any book in the
browser, and when they want to read further they are asked to buy, smoothly and in context.

**Security principle: the browser only ever receives pages the visitor is entitled to.** Hiding or
blurring pages client-side is not protection (anyone can open dev tools). So the preview is a
**separate PDF built on the server** that physically contains only the preview pages:

**As built (BS-6)**:

1. **Choosing the pages**: the editor's "Free preview" section takes named sections by PDF page
   range ("Abstract 2–2, Introduction 4–9"), the PDF page of printed page 1 (front matter offset),
   shows "7 of 52 free pages used" live, and thumbnails of the manuscript pages with the free
   pages highlighted. Since BS-20 the thumbnails are drawn **in the editor's browser** with pdf.js
   from a 30-minute signed R2 link (`GET /admin/catalog/books/:id/manuscript-link`, staff with
   2FA), reading only the byte ranges of the pages shown; an expired link offers "Reload pages". The cap is `PREVIEW_MAX_PERCENT` (default 15, owner-editable from BS-12), checked
   in the browser and authoritatively by the API (`sectionProblems`). `PUT
   /admin/catalog/books/:id/preview` saves and **queues** a build; `POST …/preview/rebuild` retries.
2. **Building** (`PreviewWorker`, every 10s, job-locked; `PreviewService.processNext`): claims the
   oldest queued book with a conditional update, downloads the manuscript from R2 server-side,
   and runs `buildPreview` (pdf-lib): a **new** PDF with only the chosen
   pages, a small "Preview · <title>" footer, no metadata, outline, attachments or scripts from the
   master. Encrypted or unreadable PDFs and missing R2 settings fail **permanently** with a clear
   message; network errors retry up to 3 times. Each queue bumps `preview.buildToken`, and a
   build only applies if the token still matches, so an older build can never overwrite a newer
   request. A build stuck in `building` for 15 minutes is re-claimed.
3. **Storage**: the preview PDF is stored in **MongoDB GridFS** (bucket `previews`) and served by
   our API, not Cloudinary: it is small, always same-origin for pdf.js (no CORS, no Cloudinary PDF
   delivery restrictions) and works without Cloudinary locally. Its URL contains the file id, which
   changes on every rebuild, so it is cached for a year (`Cache-Control: public, immutable`). The
   previous file is deleted after the new one is applied. While a rebuild runs (for example after
   the manuscript is replaced), **the current preview keeps being served**.
4. **Locked teasers**: two images of the pages after the preview, rendered **on our server** with
   pdf.js and `@napi-rs/canvas` (`page-teaser.ts`): drawn 32px wide, blurred into a 48px JPEG of
   about 1KB and stored on the book as data URIs, so there is nothing to fetch, host or clean up.
   Unreadable by design (a test checks no dark text pixels survive). A teaser failure never fails
   the build.
5. **Contents**: derived on read from the book's table of contents plus the page offset, so a
   contents edit shows immediately without a rebuild. Each entry has `previewPage` (free) or
   `null` (locked). Reading the PDF's own outline is a later improvement.
6. **Public API** (`@Public`, rate-limited): `GET /catalog/books/:slug/preview` →
   `{ fileUrl, pageCount, totalPages, pageMap, sections, outline, teasers, continuesAt }` for
   published books only; `GET /catalog/previews/:fileId` streams the PDF only while it is a
   published book's current preview; `POST /catalog/preview-events` stores anonymous analytics
   (`preview_events`: book, random per-tab session id, event, page; kept 400 days). Staff can open
   any book's built preview, drafts included, through `GET /admin/catalog/books/:id/preview-file`.
7. Publishing still requires `preview.enabled` (a built preview exists).

**Reader UX** (`/books/[slug]/read`, in its own `(reader)` route group without the site header;
as built in BS-6 unless marked *later*):
- A pdf.js renderer (`pdfjs-dist` in a web worker, lazy-loaded so the book page stays fast) draws
  pages to canvas with a text layer, so the text is selectable and accessible to screen readers.
  Controls: continuous scroll (natural on phones), zoom (75–200%, fit width at 100%), keyboard
  navigation (←/→ and PgUp/PgDn turn pages, Home, End jumps to the buying options, +/−, F),
  full-screen focus mode, and **Paper / Sepia / Night** page tones (Night by default in dark mode;
  remembered). Pages render lazily near the viewport, crisp on high-DPI screens; the reader is
  client-only and loads pdf.js on demand. *Later*: a two-page spread on wide screens.
- **Table of contents** (a drawer) shows the whole book. Preview chapters are clickable; locked
  chapters show a lock icon and open the paywall card with that chapter's name ("Chapter 4: Heat
  Exchangers is in the full book").
- **Progress bar**: "Page 14 of 18 free pages · 342 pages in the full book".
- **The paywall moment**: after the last preview page, the reader scrolls into the blurred locked
  teasers fading into an inline **"Continue reading"** card. The card shows the cover, price in the
  visitor's currency, "Ebook, instant access: continue on page 19 right after payment" and "Print
  edition, ships to <country>", buy buttons, and trust badges (secure payment via
  Paystack/Stripe/Flutterwave). A gentle, dismissible nudge also appears at 80% of the preview.
  There are no pop-ups mid-read.
- **Buying without leaving the reader** (*BS-7/BS-8*; until then the card's buy buttons say
  checkout opens shortly): "Buy ebook" adds the item and opens a **checkout drawer**
  over the reader (the same checkout flow, §8.2). The provider's return URL carries
  `returnTo=/books/<slug>/read?page=<n>`. After settlement the buyer lands **back in the reader in
  full mode at the page they stopped on**, with a quiet "Unlocked. Enjoy the rest of the book"
  toast. Guests get the same flow; their reading progress follows them into the account created at
  checkout (§5).
- Buying print only: the reader keeps the preview and shows "Your print copy is on its way", and
  offers an ebook add-on if enabled.
- **No login is required** to read a preview (lowest friction, and good for SEO sharing). The last
  page read is kept in the visitor's browser (`localStorage`) and restored on return; `?page=<n>`
  (a manuscript page) opens at that page, which is how a buyer returns from checkout.
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

- Manuscripts are private objects in Cloudflare R2 (§10.0), never publicly addressable.
- `GET /library/:bookId/download` (auth required, entitlement not revoked, rate-limited 10/hour per
  user) records a `download_event` and returns a **signed URL valid for 5 minutes**.
- If the format has `stampWithBuyer` set, the PDF is stamped on each page footer ("Licensed to
  <name> <email> · Order BS-…") with `pdf-lib` at first download. The stamped copy is cached as its
  own authenticated asset per entitlement. This discourages sharing without DRM friction.
### 10.4 Print fulfilment

- A shipment record is created on payment; an admin moves it through
  processing → shipped (carrier + tracking number) → delivered. Each step emails the buyer.

## 11. Email system (built in BS-3)

**Guarantee:** an email that business logic asks for is either delivered, or visibly marked failed
and reported to the owner. It is never silently lost, and never sent twice for the same event.

**Code:** `backend/src/mail/` (+ `backend/src/jobs/` for the lease lock).

- **Provider**: Resend, with a verified sending domain (SPF, DKIM, DMARC; see DEPLOYMENT §5).
  Without `RESEND_API_KEY` (local dev and tests) the `LogTransport` prints each email, links
  included, to the API log instead of sending it. Env validation makes the key, the webhook secret
  and `MAIL_FROM` mandatory in production.
- **Enqueue, never send**: business code calls
  `MailService.enqueue({ to, template, data, dedupeKey, sendAfter? }, session?)`.
  - It is an **upsert on `dedupeKey`** (`$setOnInsert`). Enqueueing the same event twice returns the
    existing row, and, unlike insert-and-catch-duplicate, a duplicate can't abort the caller's
    transaction.
  - Pass the caller's `session` so the email commits or rolls back with the state change. This is
    tested: an email enqueued inside a failed transaction is never sent.
  - `cancel(dedupeKey)` withdraws an unsent email (unread-message reminders).
  - `requeue(id)` retries a dead one once its cause is fixed (future admin action).
- **Outbox worker** (`OutboxWorker`, every 5 s, under the `mail-outbox` job lease so one API
  instance works at a time):
  1. Reclaims rows stuck in `sending` past their 2-minute lease, from a worker that crashed mid-send.
  2. Atomically claims due rows (`queued|failed` with `nextAttemptAt ≤ now`, which also implements
     `sendAfter`), oldest first, up to 25 per run.
  3. Skips `notification` emails to suppressed addresses. `critical` ones (verification, reset,
     receipts) are always attempted because the person explicitly needs them.
  4. Renders the template, then sends with **`idempotencyKey = outbox-<id>`**. A retry after an
     ambiguous timeout can never deliver twice, because the whole retry window (about 18h) stays
     inside Resend's 24h idempotency lifetime.
  5. On success: `sent`, provider message id and subject stored. For templates marked `sensitive`
     (one-time links), **`data` is erased** so tokens don't sit in the database.
  6. Retryable failure (rate limit, quota, 5xx, network, fixable API-key problems): `failed`, with
     backoff of 30s, 2m, 8m, 32m, 2h8m, then a 6h cap, +0–20% jitter.
  7. Permanent failure (invalid address or request, template render error) or 8 attempts: `dead`,
     and an `ops.email-dead-letter` alert goes to `OWNER_ALERT_EMAIL`. An alert about a failed
     alert is never sent, to avoid loops.
  8. Final rows get `expireAt`; a TTL index deletes them after 180 days.
- **Delivery tracking**: `POST /mail/webhooks/resend` (`@Public`, unthrottled).
  - Verified with **Svix** against the exact raw body. Unsigned, forged or tampered requests get
    401 before touching the database.
  - Note: `svix` 2.x `verify()` returns nothing; we verify first, then parse. See the BS-3
    incident in ROADMAP.
  - Status updates apply only forwards in time, because events arrive out of order.
  - Permanent bounces, complaints and provider suppressions upsert `email_suppressions`.
  - Everything is idempotent, so redelivered webhooks are harmless.
  - Verified events that fail to apply are logged and still acknowledged (repeated 5xx gets
    endpoints disabled).
- **Templates**: React Email components in `backend/src/mail/templates/`. Brand colours are copied
  from the design tokens into `theme.ts`, with serif/sans font stacks, because web fonts are
  unreliable in mail clients.
  - Each template is registered in `registry.tsx` with its `subject`, `category`, `sensitive` flag
    and a realistic `sample`.
  - Every email: a 600px single column, 16px body text, AA contrast, `lang="en"`, an inbox preview
    line, a plain-text version, a copyable URL under every button, and a footer stating why the
    person got it, plus support email and postal address.
  - `npm run email:preview` renders every template to `backend/.email-previews/` (HTML + text).
  - The render test fails if any template outputs `undefined`/`null`/`NaN`, drops a link from the
    text version, or carries a token without `sensitive: true`.
- **Built in BS-3**: `auth.verify-email`, `auth.welcome`, `auth.password-reset`,
  `auth.claim-account`, `auth.security-notice` (password changed, new sign-in, email changed, 2FA
  on/off), and `ops.email-dead-letter`.
- **Added by later tickets**:
  - Commerce: order receipt (with PDF invoice), payment failed (retry link), ebook ready, shipment
    updates, refund issued, order expired ("complete your order"), back-in-stock and price-drop
    alerts.
  - Messaging: new message (sent with `sendAfter` 10 min, cancelled if read first).
  - Owner: new sale, reconciliation needed, low stock.
  - Marketing (BS-13+) only with explicit opt-in, plus `List-Unsubscribe` one-click headers
    (RFC 8058) and a preference centre.
- **Admin visibility** (BS-12): dead or suppressed emails appear in the "Needs attention" queue with
  a requeue button.

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
