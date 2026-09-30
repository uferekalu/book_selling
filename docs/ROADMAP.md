# Roadmap

**Next ticket number: BS-2**

Each ticket is one branch (`feature/BS-<n>-<suffix>`) and one squash-merged PR. The order is
deliberate: each ticket builds only on merged work. When a ticket finishes, its row is rewritten
with what actually shipped (docs/ENGINEERING_RULES.md §8). Tickets created reactively (bug reports,
follow-ups) take the next number and get a new row.

| # | Branch suffix | Scope | Status |
|---|---|---|---|
| BS-1 | `project-foundation` | See detail below | ✅ Done |
| BS-2 | `design-system` | Full token system (`tokens.css` / `tokens.ts`: brown, paper and gold scales, semantic light and dark aliases, typography with Fraunces/Inter/JetBrains Mono, radius, warm shadows, motion, z-index, grain texture); theme switching with no flash; Redux store and theme slice; UI kit tier 1 (primitives, forms, feedback, navigation, Card, BookCover 3D, BookCard, PriceTag, layout); `/design-system` showcase; WCAG contrast test over the token file; component keyboard tests | ⏳ Planned |
| BS-3 | `email-outbox` | `mail` module: Resend client, transactional outbox (atomic claim, backoff, dead-letter, `dedupeKey`), React Email base layout and brand theme, plain-text versions, Resend webhook with Svix signature → delivery status and suppression list, `jobs` lease-lock utility, `npm run email:dev` preview | ⏳ Planned |
| BS-4 | `auth-accounts` | Users, auth (register, login, refresh rotation with reuse detection, logout, `/auth/me`), verify email, forgot and reset password, claim account, default-deny guards, roles (`customer`/`admin`/`owner`), `seed:owner`, admin TOTP 2FA, audit module, rate limits and lockout; frontend auth pages, session restore with the shared refresh mutex, `/api` proxy base query with 401 retry, account profile, addresses and security tabs | ⏳ Planned |
| BS-5 | `catalog` | Authors, categories, books with formats and per-currency prices, manuscript upload (Cloudinary authenticated), covers and gallery, search (text index) and filters; `migrate-mongo`; admin book editor (without the preview picker); storefront home, `/books`, book detail (RSC, JSON-LD, abstract as HTML), author page, currency detection and switcher | ⏳ Planned |
| BS-6 | `preview-reader` | **Read-before-you-buy** (ARCHITECTURE §10.1, PRODUCT_RULES §4): server-side preview PDF generation (pdf-lib, page-range copy, "Preview" stamp, metadata strip), blurred locked teasers, outline extraction; public preview endpoint; admin preview section picker with thumbnails and 15% cap; pdf.js reader (worker, text layer, scroll/spread/zoom/fullscreen, keyboard, sepia), TOC with locked chapters, progress, end-of-preview "Continue reading" card, 80% nudge, `reading_progress`, `preview_events`; preview leak tests | ⏳ Planned |
| BS-7 | `cart-checkout-orders` | `common/money`, carts (guest and user, merge on login, repricing), shipping zones and rates, coupon engine, server quote, order placement with idempotency key and transaction (stock reservation, coupon hold, already-owned check, guest → unclaimed account), order state machine, expiry job, order numbers; frontend cart drawer, checkout steps, **checkout drawer inside the reader**, order history and detail | ⏳ Planned |
| BS-8 | `payments` | Stripe, Paystack and Flutterwave adapters; `payments` and `webhook_events` collections; initiate, webhooks (raw-body signature verification), verify-on-return, the single `settle()` with amount/currency assertion inside a transaction (entitlements, stock commit, outbox receipt); reconciliation job; refunds (two-phase, outcome-unknown); out-of-band refund and dispute detection; provider switcher UI; `/checkout/callback` (verify + poll + return to the reader at the saved page); the **full payment test matrix** | ⏳ Planned |
| BS-9 | `library-fulfillment` | Entitlements, My Library, online full reader (signed range-request URL, synced progress), downloads (5-min signed URLs, rate limit), per-buyer PDF stamping; shipments admin flow with tracking; receipt with PDF invoice; all commerce emails | ⏳ Planned |
| BS-10 | `messaging` | Socket.IO gateway (handshake auth, rooms, rejoin on reconnect), conversations and messages, staff inbox, "Ask the author" and order-linked threads, read receipts and unread counts, offline email fallback via delayed outbox, contact form (Turnstile/honeypot), in-app notifications bell | ⏳ Planned |
| BS-11 | `reviews-wishlist-coupons` | Verified-buyer reviews with rating aggregation, wishlist, coupons admin UI | ⏳ Planned |
| BS-12 | `admin-dashboard` | Revenue per currency, orders, preview → purchase conversion per book, best sellers, low stock, **Needs attention** queue (reconciliation, attention orders, dead emails), customers, audit log viewer, settings (currencies, provider switches, preview cap, refund threshold) | ⏳ Planned |
| BS-13 | `storefront-polish-seo-legal` | Landing-page art direction and motion polish, OG images, sitemap and robots, performance budget pass (LCP/INP/CLS), accessibility audit, legal pages (terms, refunds, privacy, shipping), data export and account deletion, cookie notice; **decide EU/UK digital VAT** (PRODUCT_RULES §9) | ⏳ Planned |
| BS-14 | `production-launch` | Staging and production on Vercel + Render + Atlas, domains, Resend domain DNS, live provider accounts and webhooks, Sentry, `npm audit` CI check, go-live checklist (DEPLOYMENT §6) with a real live transaction and refund per provider | ⏳ Planned |

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
