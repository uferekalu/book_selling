# Roadmap

**Next planned ticket: BS-5** · **Next reactive ticket: BS-20**

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
| BS-5 | `catalog` | Authors, categories, books with formats and per-currency prices; **Cloudinary upload pipeline** (ARCHITECTURE §10.0): signed direct uploads, Admin-API verification, 2:3 cover cropper, blur placeholders, dominant colour, `next/image` Cloudinary loader, authenticated manuscript with PDF checks and page count, orphan cleanup; `migrate-mongo`; admin step-by-step book editor with autosave and a publish checklist; storefront home, `/books` (search, filters, sort), book detail (RSC, JSON-LD, abstract as HTML), author page, header/footer/mobile nav, currency detection and switcher, recently viewed | ⏳ Planned |
| BS-6 | `preview-reader` | **Read-before-you-buy** (ARCHITECTURE §10.1, PRODUCT_RULES §4): server-side preview PDF generation (pdf-lib, page-range copy, "Preview" stamp, metadata strip), blurred locked teasers, outline extraction; public preview endpoint; admin preview section picker with thumbnails and 15% cap; pdf.js reader (worker, text layer, scroll/spread/zoom/fullscreen, keyboard, sepia), TOC with locked chapters, progress, end-of-preview "Continue reading" card, 80% nudge, `reading_progress`, `preview_events`; preview leak tests | ⏳ Planned |
| BS-7 | `cart-checkout-orders` | `common/money`, carts (guest and user, merge on login, repricing), shipping zones and rates, coupon engine, server quote, order placement with idempotency key and transaction (stock reservation, coupon hold, already-owned check, guest → unclaimed account), order state machine, expiry job, order numbers; frontend cart drawer, checkout steps, **checkout drawer inside the reader**, order history and detail | ⏳ Planned |
| BS-8 | `payments` | Stripe, Paystack and Flutterwave adapters; `payments` and `webhook_events` collections; initiate, webhooks (raw-body signature verification), verify-on-return, the single `settle()` with amount/currency assertion inside a transaction (entitlements, stock commit, outbox receipt); reconciliation job; refunds (two-phase, outcome-unknown); out-of-band refund and dispute detection; provider switcher UI; `/checkout/callback` (verify + poll + return to the reader at the saved page); the **full payment test matrix** | ⏳ Planned |
| BS-9 | `library-fulfillment` | Entitlements, My Library, online full reader (signed range-request URL, synced progress), downloads (5-min signed URLs, rate limit), per-buyer PDF stamping; shipments admin flow with tracking; receipt with PDF invoice; all commerce emails | ⏳ Planned |
| BS-10 | `messaging` | Socket.IO gateway (handshake auth, rooms, rejoin on reconnect), conversations and messages, staff inbox, "Ask the author" and order-linked threads, read receipts and unread counts, offline email fallback via delayed outbox, contact form (Turnstile/honeypot), in-app notifications bell | ⏳ Planned |
| BS-11 | `reviews-wishlist-coupons` | Verified-buyer reviews with rating aggregation, wishlist, coupons admin UI | ⏳ Planned |
| BS-12 | `admin-dashboard` | Revenue per currency, orders, preview → purchase conversion per book, best sellers, low stock, **Needs attention** queue (reconciliation, attention orders, dead emails), customers, audit log viewer, settings (currencies, provider switches, preview cap, refund threshold) | ⏳ Planned |
| BS-13 | `storefront-polish-seo-legal` | Landing-page art direction and motion polish, OG images, sitemap and robots, performance budget pass (LCP/INP/CLS), accessibility audit, legal pages (terms, refunds, privacy, shipping), data export and account deletion, cookie notice; **decide EU/UK digital VAT** (PRODUCT_RULES §9) | ⏳ Planned |
| BS-14 | `production-launch` | Staging and production on Vercel + Render + Atlas, domains, Resend domain DNS, live provider accounts and webhooks, Sentry, `npm audit` CI check, go-live checklist (DEPLOYMENT §6) with a real live transaction and refund per provider | ⏳ Planned |
| BS-15 | `gifts-bundles-preorders` | Buy an ebook **as a gift** (recipient email, message, scheduled delivery, gift claim link); **bundles** (e.g. print + ebook at a discount, multi-book course packs); **pre-orders** for upcoming books (charged at order and fulfilled on release, or cancel and refund) | ⏳ Planned |
| BS-16 | `institutional-orders` | Universities, libraries and lecturers: **bulk orders** with quantity pricing, request-a-quote, **proforma invoice and bank transfer / purchase order** payment with manual confirmation (audited), multi-seat ebook licences with named readers, tax invoice PDFs with the buyer organisation's details | ⏳ Planned |
| BS-17 | `reader-pro` | Reader for owners: **bookmarks, highlights and notes** synced across devices, in-book search, reading stats, **offline reading** (installable PWA, owned ebooks cached encrypted with a licence check), errata and "updated edition" notices | ⏳ Planned |
| BS-18 | `engagement-marketing` | Newsletter with **double opt-in** and one-click unsubscribe; **back-in-stock**, **price-drop** and **new-edition** alerts; **abandoned-cart** reminder (consent-aware, once); public **Q&A** on book pages answered by the author; referral codes; privacy-friendly analytics with a consent banner; UTM tracking | ⏳ Planned |
| BS-19 | `instant-auth-header` (hotfix) | See detail below | ✅ Done |

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
