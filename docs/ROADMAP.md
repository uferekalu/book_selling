# Roadmap

**Next planned ticket: BS-11** · **Next reactive ticket: BS-28**

Each ticket is one branch (`feature/BS-<n>-<suffix>`) and one squash-merged PR. The order is
deliberate: each ticket builds only on merged work. When a ticket finishes, its row is rewritten
with what actually shipped (docs/ENGINEERING_RULES.md §8). Tickets created reactively (bug reports,
follow-ups, hotfixes) take the **next reactive** number, which starts after the last planned ticket,
so planned numbers never shift; they get a new row at the end of the table.

| # | Branch suffix | Scope | Status |
|---|---|---|---|
| BS-1 | `project-foundation` | See detail below | ✅ Done |
| BS-2 | `design-system` | See detail below | ✅ Done |
| BS-3 | `email-outbox` | See detail below | ✅ Done |
| BS-4 | `auth-accounts` | See detail below | ✅ Done |
| BS-5 | `catalog` | See detail below | ✅ Done |
| BS-6 | `preview-reader` | See detail below | ✅ Done |
| BS-7 | `cart-checkout-orders` | See detail below | ✅ Done |
| BS-8 | `payments` | See detail below | ✅ Done |
| BS-9 | `library-fulfillment` | See detail below | ✅ Done |
| BS-10 | `messaging` | Conversations ("Ask the author", "Question about this order", general), staff inbox with filters, live updates over Socket.IO, read receipts and unread counts, 10-minute email fallback, contact form, notifications bell. See detail below | ✅ Done |
| BS-11 | `reviews-wishlist-coupons` | Verified-buyer reviews with rating aggregation, wishlist, coupons admin UI | ⏳ Planned |
| BS-12 | `admin-dashboard` | Revenue per currency, orders, preview → purchase conversion per book, best sellers, low stock, **Needs attention** queue (reconciliation, attention orders, dead emails), customers, audit log viewer, settings (currencies, provider switches, preview cap, refund threshold) | ⏳ Planned |
| BS-13 | `storefront-polish-seo-legal` | Landing-page art direction and motion polish, OG images, sitemap and robots, performance budget pass (LCP/INP/CLS), accessibility audit, legal pages (terms, refunds, privacy, shipping), data export and account deletion, cookie notice; **decide EU/UK digital VAT** (PRODUCT_RULES §9) | ⏳ Planned |
| BS-14 | `production-launch` | Staging and production on Vercel + Render + Atlas, domains, Resend domain DNS, live provider accounts and webhooks, Sentry, `npm audit` CI check, go-live checklist (DEPLOYMENT §6) with a real live transaction and refund per provider | ⏳ Planned |
| BS-15 | `gifts-bundles-preorders` | Buy an ebook **as a gift** (recipient email, message, scheduled delivery, gift claim link); **bundles** (e.g. print + ebook at a discount, multi-book course packs); **pre-orders** for upcoming books (charged at order and fulfilled on release, or cancel and refund) | ⏳ Planned |
| BS-16 | `institutional-orders` | Universities, libraries and lecturers: **bulk orders** with quantity pricing, request-a-quote, **proforma invoice and bank transfer / purchase order** payment with manual confirmation (audited), multi-seat ebook licences with named readers, tax invoice PDFs with the buyer organisation's details | ⏳ Planned |
| BS-17 | `reader-pro` | Reader for owners: **bookmarks, highlights and notes** synced across devices, in-book search, reading stats, **offline reading** (installable PWA, owned ebooks cached encrypted with a licence check), errata and "updated edition" notices | ⏳ Planned |
| BS-18 | `engagement-marketing` | Newsletter with **double opt-in** and one-click unsubscribe; **back-in-stock**, **price-drop** and **new-edition** alerts; **abandoned-cart** reminder (consent-aware, once); public **Q&A** on book pages answered by the author; referral codes; privacy-friendly analytics with a consent banner; UTM tracking | ⏳ Planned |
| BS-19 | `instant-auth-header` (hotfix) | See detail below | ✅ Done |
| BS-20 | `r2-book-files` | See detail below | ✅ Done |
| BS-21 | `r2-storage-limit` | See detail below | ✅ Done |
| BS-22 | `stripe-country-allowlist` | See detail below | ✅ Done |
| BS-23 | `payment-reliability` | See detail below | ✅ Done |
| BS-24 | `railway-vercel-deploy` | See detail below | ✅ Done |
| BS-25 | `deploy-fixes` | See detail below | ✅ Done |
| BS-26 | `payment-audit` | See detail below | ✅ Done |
| BS-27 | `demo-showcase` | See detail below | ✅ Done |

**Launch line.** BS-1 to BS-14 are the launch. The store goes live after BS-14 with the complete
buying, reading, email, messaging and admin experience. BS-15 to BS-18 are growth features shipped
after launch, in any order the owner prefers.

## World-class feature map

What leading bookstores and publisher storefronts offer, and where each item is built here. This
checklist is reviewed whenever a ticket is planned, so nothing important is forgotten.

| Area | Feature | Ticket |
|---|---|---|
| Discovery | Fast search with typo tolerance and suggestions, filters, sorting | BS-5 (text index), BS-13 (typo-tolerant Atlas Search) |
| Discovery | Categories and curated collections ("For first-year students") | BS-5 |
| Discovery | Author page with credentials, photo and all titles | BS-5 |
| Discovery | Related books, "readers also bought", recently viewed | BS-5, BS-12 |
| Discovery | New releases, bestsellers, sale badges | BS-5, BS-11 |
| Try before buying | **Read the abstract and introduction free**, full table of contents | BS-6 |
| Try before buying | Verified-buyer reviews and ratings | BS-11 |
| Try before buying | Public Q&A answered by the author | BS-18 |
| Buying | Guest checkout, prices in NGN/USD/GBP/EUR, local payment methods | BS-7, BS-8 |
| Buying | Print + ebook bundles, multi-book packs, coupons | BS-11, BS-15 |
| Buying | Gift an ebook | BS-15 |
| Buying | Pre-orders for upcoming books | BS-15 |
| Buying | Bulk and institutional orders, quotes, invoices, bank transfer | BS-16 |
| Buying | Clear shipping cost and delivery estimate before paying | BS-7 |
| After buying | Instant ebook access: read online on any device or download | BS-9 |
| After buying | Personalised (stamped) PDFs to discourage sharing | BS-9 |
| After buying | Order tracking page, shipment emails, PDF receipts and invoices | BS-9 |
| After buying | Free corrected-edition updates and errata notices | BS-9, BS-17 |
| After buying | Bookmarks, highlights, notes, offline reading | BS-17 |
| Support | Message the author or store, live updates, email fallback | BS-10 |
| Retention | Wishlist; price-drop, back-in-stock and new-edition alerts | BS-11, BS-18 |
| Retention | Newsletter (double opt-in), abandoned-cart reminder | BS-18 |
| Trust | Secure checkout badges, refund policy, visible contact details | BS-8, BS-13 |
| Trust | Never charged twice; payments confirmed server-side | BS-8 |
| Performance | Mobile-first, fast on 3G, image CDN, installable PWA | BS-2, BS-5, BS-13, BS-17 |
| Accessibility | WCAG 2.2 AA throughout, accessibility statement | BS-2 onward, BS-13 |
| SEO | Structured data (Book, Offer, Review), sitemap, social cards | BS-5, BS-13 |
| Admin | Book editor with publish checklist, sales per currency, conversion per book | BS-5, BS-12 |
| Admin | "Needs attention" queue for money and email problems, audit log, 2FA | BS-4, BS-12 |
| Admin | CSV exports for accounting | BS-12 |
| Compliance | **NDPA 2023** (Nigeria) and **GDPR / UK GDPR**: privacy policy, lawful basis, data export and deletion, consent records | BS-13 |
| Compliance | Cookie consent (only when non-essential cookies or analytics are used) | BS-13, BS-18 |
| Compliance | Email law (CAN-SPAM, PECR, NDPA): postal address in footers, one-click unsubscribe for marketing | BS-3 (footer), BS-18 |
| Compliance | **PCI DSS SAQ-A**: card data only on the provider's hosted pages | BS-8 |
| Compliance | EU/UK digital VAT decision, tax-ready invoices | BS-13 |
| Compliance | Terms of sale, refund, shipping and accessibility statements | BS-13 |

## BS-1: Project foundation (✅ Done, 2026-09-30)

- **Repo**: bootstrapped `uferekalu/book_selling` with a README-only commit on `main` (the only
  direct push; GitHub can't protect a branch that doesn't exist). Protected `main`: PR required
  with 0 approvals (self-merge), required checks `Backend (lint, build, test)` and
  `Frontend (lint, build, test)`, enforced for admins, no force pushes or deletion, linear history,
  conversation resolution required. The repo allows squash merges only and deletes branches on merge.
- **Backend** (`backend/`): NestJS **12** scaffold. It is newer than the reference project's
  Nest 11 and differs in three ways that matter: it is **ESM** (`"type": "module"`, `.js` import
  suffixes), it tests with **Vitest** (not Jest), and it lints with **oxlint** (not ESLint). Added
  Joi env validation, `nestjs-pino` with signature/cookie redaction, helmet, CORS allow-list,
  `trust proxy 1`, global `ValidationPipe`, `AllExceptionsFilter` (a uniform error shape that hides
  5xx internals), global throttler, Mongoose (`autoIndex`), Terminus `/health`, Swagger at
  `/api/docs`, and `rawBody: true` for webhooks. Tests: env validation unit spec; a health e2e spec
  booting the real `AppModule` against `mongodb-memory-server` (via `await import()` after the env is
  set, and serial e2e files).
- **Frontend** (`frontend/`): Next.js **16.3** + React 19.2 + Tailwind v4 scaffold. `/api/*`
  rewrite to the API (first-party cookies), security headers, `getBackendUrl()` that refuses to
  build for production without `API_URL`, Vitest + RTL + jsdom, and a seed brown/paper palette with
  a placeholder page (replaced in BS-2).
- **Docs and tooling**: root, backend and frontend `CLAUDE.md`; `docs/ARCHITECTURE.md`,
  `PRODUCT_RULES.md`, `ENGINEERING_RULES.md`, `DEPLOYMENT.md` and this roadmap; project skills
  `new-feature-branch` and `money-path-review`; CI workflow; `render.yaml`; `.gitattributes` (LF).
- **Mid-ticket product change**: the lecturer asked that buyers can read the abstract and
  introduction before buying. This was designed in as a dedicated ticket (BS-6), with a
  server-generated preview PDF so locked pages never reach the browser, and it changed the data
  model: every book now has a private `manuscript` and a `preview`. Email moved ahead of auth
  (BS-3) because auth needs verification and reset emails.
- **Incidents**:
  - The first e2e run timed out: `mongodb-memory-server` was downloading its ~550MB mongod binary
    (about 6 minutes). CI caches `~/.cache/mongodb-binaries`.
  - `create-next-app`'s `@types/node@20` conflicted with Vitest 5's peer range. Fixed by moving to
    `@types/node@24` (matching Node 24), not `--force`.

## BS-2: Design system and UI kit (✅ Done, 2026-09-30)

- **Tokens** (`frontend/src/styles/tokens.css` + `tokens.ts`):
  - raw `brown`, `paper` and `gold` scales
  - 40+ semantic colours with an "espresso" dark palette, activated for both the OS preference and
    an explicit choice
  - Fraunces / Inter / JetBrains Mono through `next/font` (self-hosted)
  - fluid display type (`clamp()`), radius, warm-tinted shadows (including `shadow-book`), motion
    easings and keyframes, z-index layers, container and gutter tokens, and a paper-grain texture
  - new over the reference project: `border-input` and `focus-ring` tokens that meet WCAG 1.4.11
    (3:1 for controls)
- **Contrast is tested**: `tokens.contrast.test.ts` parses tokens.css and checks 41 pairings per
  theme against WCAG AA, plus completeness of the dark palette. On its first run it caught the gold
  button's hover text at 3.7:1; the hover was changed to lighten.
- **Theme**: a no-flash inline bootstrap script, `themeSlice` + `ThemeSync` (Redux is the source of
  truth; storage failures are handled), and `ThemeToggle` as inline radios (safe inside drawers).
- **Redux** store scaffold (the per-tree lazy store the App Router needs, and typed hooks). RTK Query
  joins in BS-4.
- **Money display**: `src/lib/money.ts` (`formatMoney` from integer minor units with a
  currency-native locale; a non-integer amount throws), plus `PriceTag`.
- **UI kit**: 40+ components in `src/components/ui` (inventory in ARCHITECTURE §6.4). Highlights:
  - Modal becomes a bottom sheet on phones
  - one shared `useDialog` (focus trap, Escape, ref-counted scroll lock, focus return)
  - BookCover (spine, page block, resting shadow, hover turn, typographic fallback) and BookCard
    (a single link per card)
  - DropdownMenu with type-ahead and viewport clamping
  - FormField wiring labels, hints and errors through context
- **Decision change**: `Select` is a styled native `<select>` rather than a custom listbox. Native
  pickers are best on phones, where most buyers are. Combobox is deferred until a screen needs
  search-as-you-type.
- **`/design-system`** showcase (noindex) with every token and component, and live overlays and
  toasts. The placeholder home page is rebuilt from kit components.
- **Tests**: 157 (Vitest + RTL), with keyboard behaviour for every interactive component (tabs,
  menu, dialogs, radios, switch, stepper, rating, tooltip, toast timing), money formatting, theme
  logic, `cn` merging and contrast.
- **Responsive verification**: `npm run check:responsive` (Playwright, a dev dependency). It loads
  pages at 320–1440px in both themes and fails if the layout viewport is wider than the device or the
  console logs errors. It passes for `/` and `/design-system`.
- **Incidents** (found by looking at real screenshots, not by the unit tests):
  1. The word "Thermodynamics" at display size made the page **397px wide on a 375px phone**. The
     phone zoomed out and the bottom sheet's second button went off-screen. A naive overflow check
     passed, because it compared the page against its own widened viewport. Fixed globally
     (`overflow-wrap: anywhere; hyphens: auto` on headings) and caught permanently by the strict
     check.
  2. At 320px, a row of avatars plus a rating had no `flex-wrap`.
  3. Titles on small typographic covers were clipped. They are now sized in container units.
  4. Radio cards squeezed their label beside a sale price on phones; the price now wraps below.
  5. A toast's dismiss callback was recreated on every render, restarting the other toasts'
     timers. It is now stable per toast.
- `motion` was installed and then removed as unused. It will be added when a screen needs gesture
  or physics animation (the reader).


## BS-3: Email system (✅ Done, 2026-09-30)

- **Transactional outbox** (`backend/src/mail`, ARCHITECTURE §11):
  - `MailService.enqueue` is an idempotent upsert on `dedupeKey` that joins the caller's
    transaction; `cancel` and `requeue` are also available.
  - The `OutboxWorker` runs every 5s under a job lease. It reclaims crashed sends, claims rows
    atomically, skips suppressed notification emails (critical ones still go), sends with the
    outbox id as Resend idempotency key, and erases one-time-link data once sent.
  - Retries back off exponentially with jitter for up to 8 attempts, staying inside Resend's 24h
    idempotency window. Permanent errors and exhausted retries become `dead` and alert the owner,
    with no alert loops.
  - A TTL index removes final rows after 180 days.
- **Transports**: `ResendTransport` (Resend SDK v6; errors classified as permanent or retryable),
  and `LogTransport` for dev and tests, which prints emails with their links. Production cannot
  boot without the key, webhook secret and `MAIL_FROM` (Joi, conditional on `NODE_ENV`).
- **Delivery webhooks**: `POST /mail/webhooks/resend`.
  - Svix signature is verified on the raw body; unsigned, forged or tampered requests get 401.
  - Status updates are applied only forwards in time.
  - Permanent bounces, complaints and provider suppressions go to `email_suppressions`.
  - Idempotent, and always acknowledged after verification.
- **Templates** (React Email): a shared brand layout, and `auth.verify-email`, `auth.welcome`,
  `auth.password-reset`, `auth.claim-account`, `auth.security-notice` and
  `ops.email-dead-letter`.
  - Each has a plain-text version, a copyable fallback link, and a footer stating why the person got
    it, with support email and postal address.
  - `npm run email:preview` renders them all. Screenshots were checked at 375px and 700px with no
    overflow.
- **Jobs**: `JobLockService` (MongoDB lease lock; the upsert race is handled). It will be reused
  by payment reconciliation and order expiry.
- **Also**: the `@Public()` decorator, ready for BS-4's default-deny guard; shared test helpers
  `createTestApp()` and `startMongo()` (an in-memory replica set so transactions work); new env
  vars in Joi, `.env.example` and `render.yaml`.
- **Tests**: 58 unit/service tests (outbox success, dedupe, concurrency, transaction rollback,
  sendAfter, cancel, retry and backoff, permanent failure, max attempts, crash reclaim, render
  failure, suppression, requeue; transport error classification; every template rendered with no
  `undefined`, links in the text version, escaping, sensitive flags; job lock race and expiry) plus
  10 e2e tests (signed, forged, tampered and unsigned webhooks; bounce, complaint and delivery
  handling).
- **Design added for the owner's question** about Cloudinary book uploads: ARCHITECTURE §10.0
  (public images vs an authenticated manuscript, signed direct uploads, server verification, cover
  cropping and delivery, the step-by-step "Add a book" editor, backups). BS-5's row was updated.
  **Open item before BS-5:** confirm the Cloudinary plan's maximum upload size covers the
  largest manuscript PDF.
- **World-class feature map** added above, with new tickets BS-15 to BS-18 (gifts, bundles and
  pre-orders; institutional orders; advanced reader; engagement and marketing).
- **Incidents**:
  1. `svix` 2.x `Webhook.verify()` returns `undefined` (v1 returned the payload). Every signed
     webhook would have 500'd in production. It passed type-checking; the real-app e2e test
     caught it.
  2. A retry-exhaustion test stepped the clock 7h against a 6h+20% jittered delay, so it was flaky.
     It now steps past the maximum.
  3. Type errors in spec files only showed up under `tsc`, because Vitest doesn't type-check.
     CI runs `tsc --noEmit`, which is exactly why that step exists.


## BS-4: Accounts, sign-in and security (✅ Done, 2026-10-01)

- **Backend**: `users`, `auth` and `audit` modules (ARCHITECTURE §5 is the full as-built design).
  - Register (terms and consent recorded); login with generic errors and dummy-hash timing.
  - Lockout: 10 failures lock the account for 15 minutes.
  - Rotating refresh tokens with reuse detection and a **30s grace window for multi-tab races**.
  - `SameSite=Strict` cookie scoped to `/api/auth`.
  - Sessions list and revoke, plus logout-everywhere.
  - Single-use hashed email links: verify (24h), reset (60m), claim (7d).
  - Change password (signs out other devices).
  - TOTP two-step verification: AES-GCM-sealed seed, no replay, 10 hashed recovery codes,
    mandatory for staff, never bypassed by a reset.
  - Default-deny `AccessTokenGuard`, plus `RolesGuard` requiring `mfa` for staff (403
    `two_factor_required`).
  - Owner-only role changes, which revoke the target's sessions and are audited.
  - Security-notice emails; `seed:owner` script; addresses (max 10, a single default).
  - `findOrCreateForGuest`, ready for BS-7.
- **Frontend**: RTK Query `api` with `baseQueryWithReauth` (one shared renewal per tab, no
  self-deadlock) and `restoreSession` on load. Pages:
  - Sign in (with a 2FA step and recovery codes), sign up (live strength meter), forgot password,
    reset password, claim account, verify email.
  - Account: profile (currency, country, marketing consent), addresses (bottom-sheet editor), and
    security (password, 2FA setup with QR and recovery codes, devices).
  - Site header with account menu, mobile drawer, footer, and placeholder legal pages with the
    agreed principles.
  - New kit components: `OtpInput` (paste and autofill), `PasswordStrength`.
  - `RequireAuth`, and `safeNextPath` against open redirects.
- **Tests**:
  - Backend: 117 unit tests (28 auth-flow tests including the theft and race cases, crypto,
    password policy, users), plus 16 e2e tests (cookie attributes, default-deny, strict validation,
    the staff 2FA gate, no email enumeration).
  - Frontend: 186 tests (reauth logic including 5 concurrent 401s → 1 refresh, OTP input, schemas,
    safe redirects, password meter).
- **Verified live** with Playwright against the real API, an in-memory replica set and the
  production frontend build, on a 375px phone viewport. The journey: sign up → reload (still signed
  in) → confirm via the emailed link → turn on 2FA → sign out → sign in with a code → save an
  address. No layout widening and no console errors. `check:responsive` passed on 10 pages × 6
  widths × 2 themes.
- **Incidents and decisions**:
  1. **ua-parser-js 2.x is AGPL.** It was replaced with a small device-name function, and a
     licence checker (`scripts/check-licenses.mjs`) is now in CI with a rule in ENGINEERING_RULES §3.
  2. **Grace-window race.** The first version asked "does the session have a live token?", but
     the concurrent winner hadn't saved its new token yet, so a two-tab refresh looked like theft.
     It now asks "was the session deliberately ended?". Caught by the race test.
  3. bcrypt cost 12 made every service test time out. The cost is now `BCRYPT_COST` (tests 4,
     production ≥ 12, enforced by Joi).
  4. A refresh without a cookie returned 401, putting an error in every anonymous visitor's
     console (and failing the responsive check). It now returns `200 { status: "anonymous" }`.
  5. **Dialogs didn't make the background inert.** The live run found the page behind the mobile
     drawer still reachable. Now everything outside a dialog is `inert`, except toasts and Next's
     route announcer.
  6. `/verify-email` was 8px too wide at 320px (a long button label). The label was shortened and
     empty-state padding tightened on phones.
  7. Script robustness: the responsive check now rejects Git Bash–mangled paths and sanitises `?`
     in screenshot names.

## BS-27: Showcase catalogue for the lecturer demo, favicon, faster preview (✅ Done, 2026-10-04)

- **Asked for**: about 10 rich foundry and heat-treatment textbooks on the live site for a demo,
  and the header's book logo as the favicon instead of Next.js's.
- **Showcase books**: `npm run seed:demo` now has 12 titles, 4 of them new: *Gating and Risering
  Design*, *Cast Irons*, *Surface Hardening of Steels*, *Investment Casting*. Prices are in all four
  currencies; stock shows in-stock, low and sold-out states. Changes to the script:
  - `--live` allows a hosted site; production is still refused without it.
  - With R2 configured, it **uploads each full book**, so a demo purchase can be read and
    downloaded; older demo books with a placeholder file are upgraded.
  - It stops every background job before the first tick, so a run against a hosted database never
    sends that site's emails from a laptop.
  - It never adds a title that already exists, and `--remove` also deletes uploaded files.
- **Run on the live site** (Atlas, R2 `book-selling/staging`): 11 books added. The 12th title
  duplicated a book the owner had added, which has a cover, a file and an order; only the demo copy
  was removed and the cache refreshed.
- **Favicon**: `icon.svg`, `apple-icon.png` (180 px) and a real `favicon.ico` (16/32/48), drawn
  from the header tile (espresso brown, open book).
- **Preview speed**: on the owner's connection the first page took about 13 s, a chain of five
  downloads. The book page now prefetches pdf.js and its worker when idle (skipped on save-data or
  2G). The preview file downloads in parallel with pdf.js instead of after it.

## BS-26: Payment system audit (✅ Done, 2026-10-04)

The owner asked for a line-by-line review of every payment path. The core held up: exact amount
and currency matching in `settle()`, atomic claims, transactions, idempotent webhooks, and
two-phase refunds. Eight gaps were fixed, each with a test.

1. **Lost success after a "failed" attempt**: Paystack lets a buyer try another card on the same
   page, so a "failed" attempt can still be paid. Reconciliation now re-checks `failed` and
   `abandoned` attempts every 30 minutes for 48 hours. It skips attempts whose page never opened
   (`started: false`).
2. **Webhooks that failed to process were lost**: we always answer 2xx, so providers never
   redeliver, and refund or dispute events had no other route back in. The verified envelope is now
   stored and retried up to 5 times; the owner is alerted after the last try.
3. **Flutterwave refunds stayed "pending" forever**: no Flutterwave refund webhook is handled. Pending
   refunds are now polled for all providers (`refundStatus`), so they complete or fail. A failed one
   frees its amount and alerts the owner.
4. **Unconfirmed refunds could never be closed**: an `outcome_unknown` refund locked its amount for
   good. The owner can now record what the dashboard shows ("Record the outcome" on the order page;
   owner-only, audited).
5. **A released order could still be paid on an old Stripe tab**: release now expires open Stripe
   Checkout Sessions first. If a session completed in the meantime, it is settled and the release
   refused.
6. **Double print purchases went unnoticed**: a second paid order for the same print book within 24
   hours is flagged before shipping.
7. **Cancelled returns showed "Confirming… don't pay again"** for about two minutes: they now show
   "Payment not completed" with "Try again" after one check.
8. The webhook controller comment claimed reconciliation picks up processing errors; that is now
   true.

- **Tests**:
  - Payments service: 12 new tests (failed→paid rescue, never-opened attempts skipped, webhook retry
    exactly once, 5-try alert, refund polling succeeded / failed / unreachable, owner resolution both
    ways, release closes the page, paid meanwhile, can't close, duplicate print).
  - Adapters: refund status for all three providers, and Stripe session expiry.
  - e2e: the resolve route is owner-only.

## BS-10: Messaging, live updates, contact form and the bell (✅ Done, 2026-10-03)

- **Customers**: Account → Messages lists conversations (unread marked). They start one there,
  from a book page ("Ask the author", through sign-in for visitors, with the book kept), or from
  an order ("Question about this order"; a second question joins the order's open conversation).
  The thread shows "Sent" / "Seen" and the owner's reply-time line.
- **Staff**: Store admin → Messages, with Conversations (Open / Unread / About an order / Closed /
  All, paged, filters in the URL) and Contact form tabs with counts. Reply, close or reopen. The
  owner sets the reply-time line there.
- **Live updates**: Socket.IO gateway authenticated by the access token at handshake. The server
  joins its rooms, so clients send nothing. It disconnects the socket when the token expires, and
  the client renews and reconnects, which rejoins the rooms. Events carry ids only, and the client
  refetches. The browser connects straight to the API, since Vercel can't proxy WebSockets.
- **Email fallback**: one "you have a new message" email per unread streak, sent after 10
  minutes and cancelled when read (outbox `sendAfter` + `cancel`). Customer replies alert
  `OWNER_ALERT_EMAIL`.
- **Contact page** (`/contact`, linked in the footer and sitemap):
  - Bots are turned away by a honeypot, a 2.5 s minimum fill time and 5 per hour per IP; they get
    the same "received" answer a person does.
  - Each address gets at most 3 acknowledgements a day.
  - The owner gets an email alert and staff get a bell entry.
- **Bell**: covers new messages and replies, contact messages, payment received, new sale, shipped,
  delivered and refund. The money and shipment entries are written inside those transactions.
- **Deviations from the plan**:
  - No conversation rooms: `user:<id>` and `staff` rooms cover every event with nothing to
    authorise per subscription.
  - Contact-form replies go by email and are not converted into account conversations, because
    the form's email is unverified.
  - Turnstile is not added; the honeypot, fill time and rate limit come first.
  - No message attachments yet.
  - Order-status events go to the bell rather than a dedicated socket event.
- **Incident during the build**: `withTransaction` retried the first write on a fresh collection
  and created a second message id. The reminder `dedupeKey` then didn't match the one stored on
  the conversation. Ids are now created before the transaction; a unit test caught it.
- **Tests**:
  - Backend unit (16): streaks, read receipts and cancellation, ownership, order and book rules,
    8 parallel sends keeping the counter exact, paging, inbox filters, contact bot rules, ack cap
    and replies. The payments spec also asserts the bell entry.
  - Backend e2e (6): auth and validation, the staff-only inbox, an HTTP round trip, a **real
    socket** (no token or a forged one refused; the reply reaches only the right customer; read
    receipt pushed), and the contact rate limit.
  - Frontend: schemas, token expiry, time formatting, Ask-the-author redirect.
  - A browser run against the local API (customer asks → staff with 2FA reply → customer sees
    "Seen" and the reply live, no reload; bell; no sideways scroll at 375px). Its test data was
    deleted afterwards.

## BS-25: First deploy fixes (✅ Done, 2026-10-03)

- **Reported**: the Vercel build failed with `ERR_INVALID_URL` (input `''`) collecting
  `/_not-found`; the Railway URL answered "Application failed to respond".
- **Vercel**: `NEXT_PUBLIC_SITE_URL` was empty, and `SITE_URL` only fell back when the variable
  was missing (`??`), so `new URL('')` broke the build. `resolveSiteUrl` now treats empty as
  unset, falls back to Vercel's own project address, and fails with a clear message for a value
  that isn't an address; `API_URL` gets the same clear check (a placeholder like `FILL_ME_…`).
- **Railway**: a healthy deploy that "fails to respond" is the public domain pointing at a port
  the app doesn't listen on. The API now logs "API listening on port N", and DEPLOYMENT §4 says to
  match the domain's port to it.
- **Tests**: site and API URL resolution (set, empty, Vercel fallback, placeholder refused).

## BS-24: Deploy on Vercel + Railway (✅ Done, 2026-10-03)

- **Decision**: the owner chose **Railway** for the API instead of Render; Vercel stays for the
  storefront. A test (staging) deployment comes first, with test payment keys.
- **What changed**: `backend/railway.json` (build with dev tools, pre-deploy migrations, start,
  `/health` check, restart on failure); `render.yaml` removed, and the production variables now
  live in a table in DEPLOYMENT §4 (rules updated everywhere that named `render.yaml`); Node 24
  pinned through `engines` in both apps; `migrate-mongo` moved to dependencies (migrations run in
  production).
- **Bug found while preparing**: the API trusted exactly one proxy, but browser requests pass
  through two (Vercel's `/api` rewrite, then Railway's edge), so every visitor would have looked
  like Vercel's server and per-visitor rate limits (e.g. 10 payment starts a minute) would have
  been shared by all customers. New `TRUST_PROXY_HOPS` (default 1; 2 in production), with a
  post-deploy check in DEPLOYMENT §4.

## BS-23: Payments that start reliably, and paying in another currency (✅ Done, 2026-10-03)

- **Reported**: "I tried to checkout and complete payment and it is not working": a 503 from
  `/payments/initiate` after ~11 s; the provider page sometimes stayed blank; an order placed in
  dollars couldn't be paid in naira without starting again.
- **Causes, reproduced with the owner's test keys**:
  1. Node's fetch gives up opening a connection after 10 s; from the owner's connection the TLS
     handshake to Paystack/Flutterwave (Cloudflare) sometimes took longer: "fetch failed" → 503.
     The same calls succeeded in 2–4 s at other times, and DNS lookups also failed intermittently.
  2. Paystack was offered for USD, but the owner's Paystack account takes NGN only ("Currency not
     supported by merchant").
  3. Flutterwave's test checkout took 16–60 s to build its form on this connection (blank until
     then), sometimes longer; and the owner's Flutterwave account refuses payments above ₦3,000
     until it is approved to go live ("Merchant limit is set at 3000 pending go live").
  4. An order's amounts are fixed in its currency by design; there was no way to change it.
- **Fixes**: undici agent with a 30 s connect timeout and up to 3 attempts for connections that
  never opened (`requestJson`; nothing that may have reached the provider is retried);
  `PAYSTACK_CURRENCIES` / `FLUTTERWAVE_CURRENCIES`; `POST /payments/release` (verifies every open
  attempt with its provider first) and "Pay in ₦ instead" on the pay step and order page; a naira
  suggestion for buyers paying from Nigeria; deliberate 503 messages now reach the buyer.
- **Verified**: unit tests for the connection retries (and that ECONNRESET is never retried),
  release (pending → released and holds freed; already paid → settled and refused; provider down →
  nothing released; wrong guest key; already closed), per-account currencies, and the error filter.
  **Live in Chromium with the owner's test keys** (verification database, deleted after): a
  Nigerian visitor browsing in dollars is offered naira; a USD order offers only Flutterwave; "Pay
  in NGN" re-prices it to ₦; naira offers Paystack and Flutterwave; the buyer reaches Flutterwave's
  secure page with the right amount. **A real Paystack test payment end to end**: a guest order at
  ₦2,500 placed and started through our API, the test card charged (PIN/OTP), then our verify asked
  Paystack and settled it: order paid, payment succeeded with exactly NGN 2,500, receipt queued with
  the invoice attached, ebook in the library. (Paystack's charge API can't reuse the reference our
  initialize created, so the card was charged under a fresh reference and our payment record pointed
  at it; everything after that was real.) Flutterwave: its test page built the card form in 16–60 s
  when it loaded at all for the automated browser, and the account's ₦3,000 pre-go-live cap refused
  the ₦15,000 test order; the store's side was verified up to Flutterwave's page.
- **For the owner before launch** (DEPLOYMENT §6): complete Paystack and Flutterwave business
  verification so the test-mode limits are lifted; ask Paystack to enable USD if wanted, then add it
  to `PAYSTACK_CURRENCIES`.

## BS-22: Stripe only where the business is compliant (✅ Done, 2026-10-02)

- **Why**: the owner: "Stripe should be used only in locations where all compliances are met."
  Stripe doesn't onboard Nigeria-only businesses, so the store may only use it where its Stripe
  account is allowed to trade. Chosen: an explicit allow-list of buyer countries (US, UK and the
  euro area for now).
- **Backend**: `STRIPE_COUNTRIES` (ISO codes; Joi-validated, and **required** whenever Stripe keys
  are set, so Stripe can't be switched on everywhere by accident). `providersFor` offers Stripe
  only when the buyer's country is on the list; an unknown country never gets it; Stripe was
  removed from NGN routing. Orders store the buyer's country (`order.country`, required by
  `PlaceOrderDto`); `/payments/options` takes it, and `initiate` re-checks the **order's**
  country, so asking for Stripe directly is refused.
- **Frontend**: checkout's Details step asks "Country you're paying from", prefilled from a
  `bs_country` cookie that the proxy sets from the host's geo header (else the browser language);
  it also prefills the shipping country. Pay-now asks for the options of the order's country.
- **Also found**: the owner's checkout said "Online payment in NGN isn't available" because no
  provider keys were set in `backend/.env` (providers are off without keys, by design). The
  payment variables were added to their `.env` in test mode; they filled in test keys for all three
  providers, and the file was checked against the validation (values never read out).
- **Verified**: resolver unit tests (NGN never Stripe; allowed/unknown/excluded countries; keys
  off), env tests (Stripe keys without a list refuse to boot; bad codes refused), a payments test
  that a Nigerian buyer paying USD can't start a Stripe payment while an American one can, e2e
  (an order without a country is refused), and frontend country-detection tests.

## BS-21: Optional R2 storage cap for development (✅ Done, 2026-10-02)

- **Why**: development uses the developer's own Cloudflare account and card until launch; the owner
  asked that test uploads never pass the free 10GB.
- **What**: optional `R2_STORAGE_LIMIT_MB` (Joi, `.env.example` default 2048, documented as
  deliberately unset in `render.yaml`). Starting a book PDF upload that would exceed it is refused
  with 409 `storage_limit` and a message giving used/limit/file size. Usage = finished files
  listed from R2 under this environment's folder (`BookFilesService.storedBytes`, paginated) +
  declared size of uploads still in progress. 409 rather than 507 because the error filter hides
  5xx messages.
- **Verified**: unit tests (limit counted across stored files and in-progress uploads, freed by
  deleting; no limit when unset; listing pagination); live: the BS-20 checks passed against the
  owner's real R2 bucket (20/20: multipart upload, ListParts, CORS preflight and exposed headers,
  ranged signed read, private bucket, tampered/other-file/expired links refused, incomplete upload
  refused, abort, cleanup), and the usage listing works with the bucket-scoped token.

## BS-20: Book PDFs move to Cloudflare R2 (✅ Done, 2026-10-02)

- **Why**: while costing the services for the lecturer, Cloudinary's per-file limits turned out to
  be 10MB (free), 20MB (Plus, $99/month) and 40MB (Advanced, $249/month). Foundry textbooks with
  diagrams are often 30–200MB, so book PDFs could not be stored without an expensive plan or heavy
  compression. Cloudflare R2: no practical per-file limit, first 10GB free, free downloads. The
  owner chose R2. Cloudinary stays, on its free plan, for images only.
- **Backend**: `BookFilesService` (S3 client for R2; checksum calculation set to "when required"
  so browser PUTs work), `ManuscriptsService` and `manuscript_uploads` records; endpoints
  `POST /admin/catalog/books/:id/manuscript-uploads` (+ `/parts`, `/complete`, `/abort`),
  `POST …/manuscript { key }` and `GET …/manuscript-link`. Completion trusts only the parts R2
  lists, at exact sizes. Attach downloads and reads the file (PDF header, pdf-lib, encrypted or
  damaged refused and deleted, SHA-256 checksum, identical re-upload is a no-op). Replaced files
  of a book ever on sale are kept in `previousManuscripts` for BS-9; a draft's are deleted.
  Cleanup job covers both stores. Teasers are now rendered on our server (pdf.js +
  `@napi-rs/canvas`) as ~1KB data URIs, so they no longer need Cloudinary and demo books get them
  too. The Cloudinary service lost its manuscript, private-download, page-render and teaser code.
  Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (required in
  production), `R2_FOLDER`, optional `R2_ENDPOINT`; `MANUSCRIPT_MAX_MB` default 100 → 200,
  `IMAGE_MAX_MB` default 15 → 10 (the free Cloudinary plan's limit). Migration
  `20261002000000-manuscript-key` renames `manuscript.publicId` → `key`.
- **Frontend**: `uploadInParts` (8MB pieces, 3 in parallel, per-piece retry with backoff, fresh
  link on 403 or after 50 minutes, parallel pieces share one signing request, server-side cancel on
  failure) and `useManuscriptUpload`; the Book file section shows "Checking the PDF…" while the
  server reads it. Preview page thumbnails are drawn in the editor's browser with pdf.js from a
  30-minute signed link, reading only the pages shown, with "Reload pages" when it expires.
- **Verified**: unit tests (R2 service with a stubbed client: key rules, part arithmetic, signed
  URLs carry no checksum requirement or secret, ListParts pagination, strict/best-effort deletes;
  teaser images contain no dark text pixels), catalogue and preview specs against an in-memory R2
  fake (wrong-book keys, non-PDF and damaged files, oversize, incomplete parts, cancel, kept vs
  deleted old files, cleanup), the uploader's retry/re-sign/cancel paths, and e2e route checks.
  Also run against a local S3-compatible server (s3rver): browser-style bare PUTs of signed parts,
  completion, content match and a signed ranged read (206) all worked. s3rver lacks ListParts and
  abort, and doesn't check signatures; all three were then confirmed against the owner's real R2
  bucket (BS-21 record).
- **Deviation**: none from the plan; Cloudinary's PDF page rendering (thumbnails, teasers) was
  replaced by pdf.js in the browser and on the server.

## BS-19: Sign-in buttons appear instantly; local setup fixes (✅ Done, 2026-10-01, hotfix)

- **Reported**: "I tried to open the create account and sign in page but it did not open."
- **Cause, reproduced in a real browser against the owner's dev server**: the header showed a
  placeholder instead of **Sign in / Create account** until the on-load session check answered.
  The API wasn't running locally (no `backend/.env`), so the check went to the dev proxy, took
  **5.3 s** and failed with 500. For those seconds there was nothing to click. The pages themselves
  always opened when visited directly.
- **Fix**: a readable, secret-free session hint cookie `bs_session=1` (path `/`,
  `SameSite=Strict`, same expiry as the refresh cookie). It is set with every session and cleared
  on sign-out, logout-everywhere, failed refresh, and a cookie-less refresh. Without the hint, the
  storefront marks the visitor signed out **immediately, with no request**. Sign-in buttons now show
  as soon as the page hydrates, and anonymous visitors no longer call `/auth/refresh` at all.
- **Second bug found while setting up**: empty values in `.env` (`RESEND_API_KEY=`, exactly as
  in `.env.example`) failed Joi validation, so copying the example made the API refuse to boot.
  Optional strings now use `.empty('')` (empty means "not set"), production still rejects empty
  required values, and `||` defaults replace `??` where an empty string must fall back.
- **Local setup**: generated a git-ignored `backend/.env` for the owner's machine (fresh secrets,
  local MongoDB, email printed to the terminal). Verified: the API boots, the proxy works, and the
  full desktop flow passes (header Create account → sign up → sign out → header Sign in) with no
  console errors.
- **Tests**: e2e assertions for the hint cookie's attributes and its clearing on sign-out; env
  tests for empty values; `SessionBootstrap` tests (no hint means signed out with zero requests,
  hint present means restore).
- **Process**: hotfix branched from `main` with BS-5 work stashed; introduced separate "next
  planned" and "next reactive" ticket numbers so planned numbers never shift.

## BS-5: Catalogue, Cloudinary uploads, storefront and book editor (✅ Done, 2026-10-01)

- **Backend** (`catalog` and `uploads` modules; ARCHITECTURE §10.0 is the as-built design):
  - Authors, categories (subjects) and books: formats (ebook/print) with an explicit price per
    currency in integer minor units, optional sale prices, print stock/reserved/weight/limit,
    denormalised `fromPrices`, text search index, slug history with redirects, sanitised Markdown
    (`marked` + `sanitize-html`), and the **publish checklist** (`publishProblems`), enforced by
    the API and returned as `problems` when publishing is refused.
  - Status rules: publish, unpublish, archive; only never-published drafts can be deleted; a
    published book can't lose its last format on sale; stock can't drop below reserved copies.
  - **Cloudinary pipeline**: signed direct uploads per owner folder, Admin-API verification before
    attaching (folder, format, size, dimensions, pages, etag), crop-first delivery URLs, blur
    placeholder, dominant colour, the manuscript as an `authenticated` asset whose URL is never
    returned, and `UploadCleanupJob` (hourly, job-locked) that deletes abandoned `pending`
    uploads after checking the database for references.
  - Public `/catalog/*` (list with search, subject, author, format, price and sort; detail with
    redirects; related; subjects with counts; authors; sitemap) and staff-only
    `/admin/catalog/*` (with 2FA), including `markdown-preview`. Every edit is audit-logged and
    refreshes the storefront cache through `/internal/revalidate`.
  - `migrate-mongo` with a baseline migration (run by Render's pre-deploy step); a demo seed of 8
    foundry and heat-treatment books (`seed:demo`, refuses production, `--remove`).
- **Frontend**:
  - Storefront (server components): new home page (hero with featured covers, subjects, new and
    notable, the author, FAQ), `/books` with search, subject and format filters (bottom sheet on
    phones), sort and pagination in the URL; the book page (cover, sample pages, format picker with
    stock, abstract, description/contents/details tabs, related books, JSON-LD); author pages;
    not-found page; `sitemap.xml` and `robots.txt`; **recently viewed** (this browser only, no
    prices stored).
  - Currency detection in `proxy.ts` (country, then language), a switcher in the header and
    drawer; Cloudinary `next/image` loader.
  - **Admin**: book list (search, status tabs, new-book dialog) and a one-page book editor with
    independent sections (details, abstract and description with live preview, table of contents
    as text, cover upload with a 2:3 cropper, sample pages, chunked book-PDF upload with progress
    and cancel, formats and prices), a status card with the checklist, and an unsaved-changes guard;
    authors (with photo) and subjects managers.
  - New kit component `MoneyInput`; `parseMajorToMinor` (string parsing, never float maths);
    `lib/upload.ts` (chunks, retries, re-signing, cancel).
- **Not done here, by design**: buying (BS-7/8, the buttons say checkout opens shortly), the
  preview builder and reader (BS-6; publishing requires it, so nothing can go on sale before BS-6),
  rejecting encrypted PDFs (BS-6, the first step that reads pages), filling the contents from the
  PDF outline (later).
- **Tests**: backend 166 unit tests (rich text, catalogue rules, Cloudinary signing and
  verification, 18 catalogue service tests including cleanup) and 22 e2e tests (admin 2FA gate,
  editor flow over HTTP, float prices rejected, sanitised Markdown preview); frontend 266 tests
  (money parsing, upload client, crop maths, contents parser, editor logic, `MoneyInput`, currency
  detection, image loader, recently viewed).
- **Verified live** against the real API with the demo catalogue and the production build:
  `check:responsive` passed on 9 pages × 6 widths × 2 themes; the admin area was checked at 375px
  and 1440px after a real sign-in with a 2FA code (books, editor, authors, subjects, new-book
  dialog), with no overflow and no console errors.
- **Incidents and decisions**:
  1. **Render build would have failed on first deploy**: `NODE_ENV=production` makes `npm ci`
     skip devDependencies (the Nest CLI and TypeScript). The build is now
     `npm ci --include=dev`, and migrations run as the pre-deploy command.
  2. Explicit per-section saves instead of autosave (ARCHITECTURE §10.0 explains why).
  3. `tsx` doesn't emit decorator metadata, so the DI-based seed script is compiled with `tsc`.
  4. React's `set-state-in-effect` lint rejected syncing editor state in effects; sections now
     sync during render, keyed on `updatedAt`.
  5. Under full parallel load, a 1.5s database-backed test hit vitest's 5s default; the backend
     timeout is now 20s.
  6. Covers and copy now depict foundry and heat treatment (the lecturer's field), not
     thermodynamics.

## BS-6: Read before you buy: the preview reader (✅ Done, 2026-10-01)

- **The rule** (PRODUCT_RULES §4): anyone can read the abstract and introduction, chosen by the
  lecturer, with no account; at the end they are invited to buy. **Only the free pages ever leave
  the server**: the preview is a new PDF built from those pages alone.
- **Backend** (`src/preview`; ARCHITECTURE §10.1 "As built"):
  - `buildPreview` (pdf-lib): copies only the chosen pages, adds a "Preview · title" footer, drops
    the master file's metadata, outline and attachments; rejects encrypted or unreadable PDFs with
    a clear message; enforces `PREVIEW_MAX_PERCENT` (15%).
  - Background builds (`PreviewWorker`, job-locked) with a build token so a stale build never
    wins, retries for transient errors, and recovery of stuck builds; a replaced manuscript
    re-queues the build while the current preview keeps being served.
  - Storage in GridFS, served by the API with year-long caching; blurred 48px teasers of the next
    pages via Cloudinary; contents derived from the table of contents plus a front-matter offset.
  - Endpoints: public preview description and file (published books only), anonymous
    `preview_events` analytics; admin sections, rebuild, page thumbnails, and a staff-only file
    endpoint so drafts can be checked before publishing. Deleting a draft removes its preview.
- **Frontend**:
  - **Reader** at `/books/<slug>/read` (full screen, client-only, pdf.js in a worker): crisp pages
    with selectable text, lazy rendering, zoom, Paper/Sepia/Night tones, full screen, keyboard
    shortcuts, the whole contents in a drawer (locked chapters explain they're in the full book),
    "Page 3 of 7 free pages · 405 pages in the full book", resume where you left off (`?page=`
    for returning buyers), one dismissible hint at 80%, and the end of the preview flowing through
    blurred locked pages into the **Continue reading** card with prices and formats.
  - Book page: "Read the introduction free →" under the abstract and in the format picker.
  - Admin editor: a **Free preview** section: named page ranges, the printed-page-1 offset, live
    "7 of 52 free pages used" and problems, page thumbnails with free pages highlighted, build
    status that updates itself, Open preview, Rebuild.
- **Demo data**: `seed:demo` now typesets a stand-in manuscript for each demo book and builds a
  real preview with the production builder, so the reader works locally without Cloudinary.
- **Not done here, by design**: paying from the reader's card (the buttons say checkout opens
  shortly) and returning to the page after payment (BS-7/BS-8); full-book reading for owners
  (BS-9); a two-page spread on wide screens and reading the PDF's own outline (later).
- **Tests**: backend 183 unit tests (builder: exact pages copied, proven by a unique width per
  page, metadata dropped, cap, unreadable files; service: build and serve end to end, drafts and
  old files never served, stale builds discarded, permanent vs retried failures, manuscript
  replacement, analytics) and 23 e2e tests; frontend 276 tests (reader rules, section rules).
- **Verified live** with the production build against the real API and demo previews: the reader
  on a 375px phone and at 1440px (text layer present, contents drawer, locked chapter message,
  end card), the admin Free preview section after a real 2FA sign-in (the staff preview file
  served as a PDF), and `check:responsive` on the home, list, book and reader pages.
- **Incidents and decisions**:
  1. **Preview stored in GridFS, not Cloudinary**: small, same-origin for pdf.js (no CORS or
     Cloudinary PDF-delivery limits), works locally, cached forever by versioned URL.
  2. A damaged file with a PDF header "loaded" in pdf-lib and then failed later, and was being
     retried as if temporary; any parsing failure is now a permanent "can't read this PDF".
  3. The API hides the text of 5xx errors, so the editor explains a 503 (no Cloudinary) itself.
  4. Under full parallel load the backend's `beforeAll` MongoDB start exceeded 10s; hook timeout
     is now 120s.
  5. A Render instance needs about 4× the largest manuscript in RAM for preview builds
     (DEPLOYMENT §4a).

## BS-7: Cart, checkout and orders (✅ Done, 2026-10-01)

- **Backend** (`src/commerce`; ARCHITECTURE §8.2 "As built"):
  - `common/money/money.ts`: the only money arithmetic (checked integers, currency-safe,
    half-up percentage once, provider major-unit strings, display formatting).
  - One pure pricing function for cart, quote and placement: availability, owned ebooks, stock
    and per-order limits, shipping by zone and currency, one coupon on the item subtotal, no free
    orders.
  - Carts for guests (httpOnly cookie) and users, merged on sign-in, re-priced on every read, with
    "the price changed since you added it". `@OptionalAuth()` so a stale token renews instead of
    showing a guest cart.
  - Shipping zones (one zone per country, an "everywhere else" zone) and coupons (percent or fixed
    per currency, minimum spend, dates, total and per-customer limits, book/format restrictions):
    admin APIs and audit entries.
  - Orders: idempotent placement (hashed checkout key, which also proves a guest's access), one
    transaction for buyer, re-quote, one open checkout per buyer, optimistic stock hold, coupon
    hold, order number and the 30-minute window; a totals invariant on every save; cancel and
    expiry release holds exactly once; one "complete your order" email per expired order, queued
    in the same transaction; the order state machine with an exhaustive table.
  - Entitlement schema (library) so owned ebooks are refused now; granting comes with settlement.
- **Frontend**: cart button and drawer in the header, `/cart`, `/checkout` (Details → Shipping
  for print → Review & pay, server-quoted totals, discount code, terms, idempotent "Place order"),
  checkout in a drawer over the preview reader (returning to the reader page after payment, from
  BS-8), "Buy ebook"/"Add to cart" wired, "In your library" for owned ebooks, account Orders list
  and detail with cancel, the guest order page, admin **Shipping** zones editor and **Orders** list.
  The order confirmation says plainly that online payment opens with the next update.
- **Not done here, by design** (BS-8): taking payment, settlement, receipts, clearing the cart on
  success, and the 15-minute "payment in progress" grace in expiry and in one-open-checkout.
  Coupon admin screens: BS-11 (the API is complete).
- **Money-path review** (`.claude/skills/money-path-review`): amounts, transitions, transactions,
  idempotency and concurrency items pass; settlement, webhook and refund items are BS-8/BS-9.
  Fixed during the review: two places summed money outside the money module (the coupon's
  eligible subtotal and the order invariant), the expiry reminder was queued after the commit
  (now inside the transaction), and the per-customer coupon count now reads inside the order
  transaction.
- **Tests**: backend 223 unit tests (money, pricing and coupons table-driven, the state machine's
  full table, 14 order integration tests including the same key sent twice at once and two
  buyers racing for the last copy, expiry releasing exactly once, superseded checkouts, guests,
  owned ebooks, coupon limits, the totals invariant) and 28 e2e tests (guest cookie attributes,
  strict validation, stale token 401, idempotent placement, guest lookup by key only, customer
  isolation, admin gating); frontend 280 tests (checkout key, plus the earlier suites).
- **Verified live** on a 375px phone against a replica-set database: add print to cart (drawer),
  "Buy ebook" to checkout, validation, shipping address, a wrong discount code explained, "Place
  order · ₦42,500.00" (₦25,000 + ₦15,000 + ₦2,500 shipping), order reserved, the guest order page,
  and checkout opening over the reader; the database showed the older checkout replaced and its
  stock released, one copy held, and an unclaimed account for the guest. No console errors or
  layout widening; `check:responsive` passed on home, book, cart, checkout and reader pages × 6
  widths × 2 themes.
- **Incidents and decisions**:
  1. The local MongoDB is a standalone Windows service, so transactions fail there; checkout now
     answers 503 with a clear log, and DEPLOYMENT §2 has the four steps to make the service a
     replica set.
  2. `POST /orders/guest/cancel` would have been captured by `/orders/:orderNumber/cancel`;
     guest routes moved to `/guest-orders/…`.
  3. The cart is kept until payment (not cleared at placement), so an expired order loses
     nothing; a newer checkout replaces an older unpaid one instead.
  4. Accepted: for guests, "already in your library" is checked against the account with that
     email (prevents paying twice; reveals ownership only to someone who types that email).

## BS-8: Payments with Paystack, Flutterwave and Stripe (✅ Done, 2026-10-01)

- **Adapters** behind one interface: Paystack (kobo, HMAC-SHA512 webhooks, `abandoned` stays
  pending), Flutterwave (**major units both ways via exact string conversion**, verif-hash plus
  **re-verification of every webhook with the API**), Stripe (official SDK, Checkout Session with
  one line for the exact total, `constructEvent` with a 5-minute tolerance, idempotency keys on
  create and refund). Each adapter separates "the provider said no" (shown to the buyer) from
  "the outcome is unknown" (never assumed).
- **Configuration safety**: `PAYMENTS_MODE` test/live; the API refuses to boot when a key doesn't
  match the mode, when a provider's webhook secret is missing, or when live production has no
  provider. Providers are offered only when configured, so Stripe can be off at launch.
- **settle()**, the only code that marks money received: known reference, matching provider, a
  failure never downgrades a success, **amount and currency must match exactly or the order is
  flagged and not paid**, then one transaction for payment, order, stock (committed, or taken
  again for a late payment, else "ship later or refund"), coupon, ebook library entries, the
  buyer's carts (account and the guest cart the order came from), receipt, owner "new sale" and
  attention emails. Audit entry and the guest's "set your password" link after commit. The
  database refuses a second settled payment per order; that case is flagged for refund.
- **Webhooks** deduplicated per provider event; a failed or stuck event is reprocessed when the
  provider redelivers it. **Reconciliation** every 5 minutes rescues lost webhooks; attempts older
  than 48 hours are closed. Expiry and "one open checkout" now wait 15 minutes for a payment in
  progress.
- **Refunds** (owner only): atomic claim that can never exceed what was paid (even concurrently),
  Stripe idempotency key, a refusal releases the balance, **any unknown or unexpected outcome is
  held, flagged and never retried**; refund webhooks confirm pending refunds; dashboard refunds
  (Stripe, Paystack) are detected and recorded; a full refund removes the order's ebooks.
  Disputes flag the order. "Needs attention" shows in the admin list and on the order, with a
  required resolution note (audited).
- **Frontend**: the payment step after placing an order (provider choice, "Pay ₦… with …"), the
  return page that confirms with the server and keeps checking ("confirming" → "confirmed" /
  "didn't go through" with retry), "Complete your payment" on unpaid orders, the admin order page
  (payments, refunds with a two-step confirmation, attention).
- **Payment test matrix** (ENGINEERING_RULES §6), all green: adapter request shapes and unit
  conversion, valid/invalid/missing/stale signatures; settlement success, duplicate webhook, a
  webhook racing verify and reconciliation (exactly one settlement), five parallel settles, amount
  and currency mismatch, missing amount, provider mismatch, unknown reference, failure after
  success, late payment with and without stock, second payment refused, ebook bought twice;
  failed-then-redelivered webhooks; reconciliation and abandonment; the 15-minute grace; disputes;
  full, partial, concurrent and over-refunds, provider refusal, timeout and unexpected errors as
  unknown, webhook-confirmed and dashboard refunds; one receipt per paid order. Backend 47 payment
  tests among the unit suites, 5 payment e2e tests (real HMAC over the raw HTTP body).
- **Verified live** (phone and desktop, a throwaway database): place order → "Pay ₦15,000.00 with
  Paystack" → a provider refusal shown plainly → "confirming" while pending → a signed webhook →
  the open page switches to "Payment confirmed", order paid, ebook granted, one receipt and one
  claim email, cart emptied → the owner's admin order page → a refund refused by the provider,
  shown, recorded as failed, order still paid. No console errors or overflow.
- **Found and fixed while verifying**: the guest's cart wasn't emptied after paying, and Mongoose's
  update casting silently dropped an `$or` inside `$pull`, so signed-in carts weren't emptied
  either (now one `$pull` per item, with tests for both); a failed webhook could never be
  reprocessed; an unexpected refund error could leave a refund "pending" forever; the audit entry
  was written inside the transaction; a flagged payment could later be marked abandoned; the
  Idempotency-Key header and Set-Cookie were not redacted from request logs (both earlier
  tickets); the "complete your order" email showed ": item" rows (BS-7); refund sums were done
  outside the money module; and the e2e tests loaded the developer's real `.env` (Cloudinary keys
  had just been added locally), so the app now ignores `.env` when `NODE_ENV=test`.
- **Known limits, documented**: Flutterwave dashboard refunds aren't detected automatically
  (refund Flutterwave orders from the admin); Paystack and Flutterwave have no refund idempotency
  key (one more reason refunds are never retried automatically); the owner must decide on Stripe
  for a Nigerian business before going live.

## BS-9: My Library, personal copies, shipping and invoices (✅ Done, 2026-10-02)

- **Library and reading** (ARCHITECTURE §10.2): `library` module (`LibraryService`,
  `reading_progress`, `download_events`); My Library page; the full reader for owners, streaming
  the buyer's copy from R2 in byte ranges through a 60-minute link renewed in place; progress
  synced to the account (resume on any device; `maxPage` for refund decisions); owners are sent
  from the preview to the full book, and the book page says "Read now".
- **Personal copies** (§10.3): every page stamped "Licensed to <name> · <email> · Order …" along
  the visible bottom edge (rotated pages too; Yoruba letters outside the PDF font fall back to base
  letters), built in the background (`CopyWorker`, build tokens, retries, owner alert on failure),
  rebuilt automatically for a new edition while the old copy stays readable. Downloads: 5-minute
  "save as" links, 10 per book per hour, abuse alert at 30 a day.
- **Shipping** (§10.4): processing → shipped (carrier, tracking) → delivered with buyer emails,
  conditional updates in transactions, delivery fulfils the order; admin "To ship" list and
  shipping panel; customer delivery progress with tracking link.
- **Invoices** (§10.5): PDF invoice for buyers, guests and staff, attached to the receipt through
  new outbox attachment references (built at send time, sent without after 3 failed attempts).
- **Emails**: `order.shipped`, `order.delivered`, `order.refund-issued` (on every confirmed
  refund, in the same transaction, once per refund), `library.edition-updated` (opt-in when
  replacing a sold book's file), owner alerts `ops.download-abuse` and `ops.copy-failed`; the
  receipt now opens the library and carries the invoice. **Deviations**: "Your book is ready" is
  part of the receipt rather than a second email at the same moment; "payment failed" is the
  existing "complete your order" email, which already says the payment didn't go through.
- **Refund evidence**: the admin order page shows per-ebook downloads, first opened, furthest page
  and where the preview ends.
- **Tests**: copy stamping read back with pdf.js (exact position on 0/90/180/270° pages), library
  (copies, new editions, overtaken builds, retries and alerts, access, archived books, outline,
  download limit and abuse alert, progress), shipments (sequence, refusals, concurrency, partial
  refunds), invoice content read back with pdf.js, outbox attachments (and the fallback), refund
  and receipt emails in the payments suite, library e2e routes, and a regression test for a race
  the money-path review found (delivery must not overwrite a refund landing meanwhile; fixed by
  conditioning on the exact order status). Backend 346 unit + 38 e2e; frontend 294.
  **Live**: a 4 MB book in the owner's real R2 bucket, read in Chromium at 375px and 1280px: copy
  prepared, pages streamed with range requests, stamp present, resume on the saved page, download
  and invoice saved, no console errors (19/19).
- **Also**: backend tests now run at most half the cores at once (`maxWorkers: '50%'`): with one
  in-memory MongoDB per file, a file per core starved them and unrelated tests timed out locally.

