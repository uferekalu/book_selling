# Deployment Rules

Hosting: **Vercel** (frontend), **Render** (API), **MongoDB Atlas** (database), **Resend** (email),
**Cloudinary** (images and private manuscripts), and payment providers **Paystack**, **Flutterwave**
and **Stripe**. The production go-live is ticket BS-14. Until then, this document is the plan and the
checklist.

## 1. Environments

| Environment | Frontend | API | Database | Payment keys |
|---|---|---|---|---|
| Local | `localhost:3000` | `localhost:4000` | local replica set or an Atlas dev cluster | **test** |
| Preview | Vercel preview per PR | (shared staging API) | Atlas `book_selling_staging` | **test** |
| Staging | `staging.<domain>` | Render `book-selling-api-staging` | Atlas `book_selling_staging` | **test** |
| Production | `<domain>` | Render `book-selling-api` → `api.<domain>` | Atlas `book_selling` (dedicated cluster) | **live** |

Rules:
- **Live payment keys exist only in the production Render service.** Never in `.env` files, never on
  staging, never in Vercel.
- Staging mirrors production configuration with test keys. Every money-path change is exercised on
  staging with real provider test cards before release.
- Only `main` deploys to production. Merging to `main` is the release (after BS-14 turns on
  auto-deploy).

## 2. Local development

```bash
# API
cd backend && cp .env.example .env && npm install && npm run start:dev
#   → http://localhost:4000/health   ·   http://localhost:4000/api/docs

# Storefront
cd frontend && cp .env.example .env.local && npm install && npm run dev
#   → http://localhost:3000   (browser calls /api/* → proxied to the API)
```

### Local MongoDB

Transactions (used by checkout and payment settlement) **need a replica set**. Pick one:
- **Atlas free cluster**: already a replica set. Put its `mongodb+srv://` URI in `backend/.env`.
- **Local `mongod`** (MongoDB 8 is installed on the dev machine): run it as a single-node replica
  set:
  ```bash
  mongod --replSet rs0 --dbpath <data-dir> --port 27017
  mongosh --eval 'rs.initiate()'
  # MONGODB_URI=mongodb://localhost:27017/book_selling?replicaSet=rs0
  ```
- **MongoDB installed as a Windows service** (the owner's machine): make the service a single-node
  replica set once, from an **administrator** PowerShell:
  1. Edit `C:\Program Files\MongoDB\Server\<version>\bin\mongod.cfg` and add
     ```yaml
     replication:
       replSetName: rs0
     ```
  2. `Restart-Service MongoDB`
  3. `mongosh --eval "rs.initiate()"` (once; it answers `{ ok: 1 }`)
  4. In `backend/.env`: `MONGODB_URI=mongodb://localhost:27017/book_selling?replicaSet=rs0`
  Existing data is kept. Without this, browsing works but checkout answers "temporarily
  unavailable" and the API log says MongoDB is not a replica set.

Tests don't need either: they use `mongodb-memory-server`.

### Provider webhooks locally

- Stripe: `stripe listen --forward-to localhost:4000/payments/webhooks/stripe`, which prints the
  `whsec_…` value to use as `STRIPE_WEBHOOK_SECRET`.
- Paystack and Flutterwave: expose the API with a tunnel (`cloudflared tunnel --url
  http://localhost:4000` or ngrok) and set the test-mode webhook URL in their dashboards.
- Without a tunnel, payments still complete locally through the verify-on-return path; only
  webhook-specific behaviour needs the tunnel.

## 3. Frontend on Vercel

- Project root directory: `frontend`. Framework preset: Next.js. Node 24.
- Environment variables:
  | Name | Scope | Value |
  |---|---|---|
  | `API_URL` | Production / Preview, **available at build time** (the `/api` rewrite is baked into the build) | `https://api.<domain>` / staging API URL |
  | `NEXT_PUBLIC_SITE_URL` | Production / Preview | `https://<domain>` / preview URL (canonical links, sitemap, JSON-LD) |
  | `REVALIDATE_SECRET` | Production / Preview | 16+ random characters (`openssl rand -base64 32`); the **same value** as the API's `FRONTEND_REVALIDATE_SECRET`, so catalogue edits appear at once |
- The build **fails on purpose** if `API_URL` is missing in a production build
  (`src/lib/backend-url.ts`), so we never ship a storefront pointing at localhost.
- Domains: `<domain>` (primary) and `www.<domain>` → redirect to the primary.

## 4. API on Render

- Defined by the `render.yaml` Blueprint at the repo root (root dir `backend`, `npm ci --include=dev
  && npm run build`, pre-deploy `npm run migrate:up`, `npm run start:prod`, health check `/health`).
  `--include=dev` matters: with `NODE_ENV=production` set, a plain `npm ci` skips the build tools and
  the build fails.
- Every `sync: false` variable is set in the Render dashboard. **The list in `render.yaml` must
  match `backend/src/common/config/env.validation.ts`**: a missing required variable stops the API
  booting, and the Render deploy fails the health check instead of serving errors.
- Plan: at least Starter (no sleeping) for production. Webhooks and the reconciliation jobs need an
  always-on instance.
- Custom domain `api.<domain>`. `CORS_ORIGINS` = the storefront origin(s).
- Scheduled jobs run inside the API process with lease locks, so scaling to more than one instance is
  safe.
- **First deploy of each environment**: register the lecturer's account on the site, then run
  `npm run seed:owner -- <their email>` once (Render Shell, or locally with that environment's
  `MONGODB_URI`). The owner must then turn on two-step verification before any store management
  page opens. Admins are added by the owner from the admin area; the owner role is never granted
  through the API.

## 4a. Cloudinary (book files and images)

1. One Cloudinary account; **upgrade the plan** so its maximum upload size covers the largest book
   PDF, then set `MANUSCRIPT_MAX_MB` on Render to that size (default 100). The admin upload screen
   refuses larger files up front with a clear message.
2. Render env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (required in
   production; the API will not boot without them) and `CLOUDINARY_FOLDER`: a different folder per
   environment (`book-selling/production`, `book-selling/staging`, locally
   `book-selling/development`). The abandoned-upload cleanup only ever touches its own folder.
3. Cloudinary console → Settings → Security: keep **"Strict transformations"** off (the storefront
   requests sizes on the fly) and leave PDF delivery restricted; manuscripts are `authenticated`
   and never reachable without a signed URL from our API.
4. Turn on Cloudinary **Backups** for the account, and keep the original manuscripts elsewhere too.
5. **Preview building needs memory**: the API loads the whole book PDF to copy the free pages
   (BS-6). Give the Render instance at least about 4× the largest manuscript in RAM: Starter (512MB)
   suits books up to roughly 100MB; use Standard (2GB) for larger ones. A build that runs out of
   memory restarts the instance and is retried automatically.
6. Smoke test on staging: upload a cover (crop it), a sample page and a PDF from a phone; choose
   the free preview pages and wait for "Ready"; open the reader on a phone and check that it ends
   in the "Continue reading" card, and that the book PDF's URL never appears in the browser.

## 5. Email (Resend)

1. Add the sending domain (e.g. `mail.<domain>`) in Resend and create the **SPF, DKIM and DMARC**
   DNS records it lists. Start DMARC with `p=none; rua=…`, then move to `quarantine` once reports
   are clean.
2. Render env: `RESEND_API_KEY` (a sending-only key), `MAIL_FROM` =
   `"<Author Name> Books <books@mail.<domain>>"`, `MAIL_REPLY_TO` / `SUPPORT_EMAIL` = the support
   inbox, `OWNER_ALERT_EMAIL` = the owner's own inbox (**not** on the sending domain, so alerts
   still arrive if that domain has a problem), `BRAND_NAME`, and `BUSINESS_POSTAL_ADDRESS`.
   `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` and `MAIL_FROM` are required in production: the API
   will not boot without them.
3. Create the Resend webhook → `https://api.<domain>/mail/webhooks/resend` for `email.delivered`,
   `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` and
   `email.suppressed`, and set its signing secret as `RESEND_WEBHOOK_SECRET`. Unsigned or forged
   calls get 401.
4. Send test emails to Gmail, Outlook and Yahoo and confirm they land in the inbox, not spam.
   Check how they look first with `npm run email:preview` (backend).
5. Without `RESEND_API_KEY` (local dev), emails are printed to the API log, links included, and
   nothing is sent.

## 6. Payment providers: go-live checklist

For **each** provider:
- [ ] Business account verified (KYC complete). *From the reference project: an unverified Paystack
      "starter business" can collect payments but is blocked from some APIs. Check the account
      tier before launch, not after.*
- [ ] `PAYMENTS_MODE=live` and the live secret key set in production Render only;
      `PAYMENTS_MODE=test` and test keys on staging. The API refuses to boot if a key doesn't match
      the mode, so live keys can't end up on staging or a laptop.
- [ ] To switch a provider off (for example Stripe until there is a supported company), leave its
      keys empty: it is simply not offered.
- [ ] Webhook URL set in the **live** dashboard:
      `https://api.<domain>/payments/webhooks/stripe` · `/paystack` · `/flutterwave`
- [ ] Webhook secret set (`STRIPE_WEBHOOK_SECRET`; Paystack signs with the secret key;
      `FLUTTERWAVE_WEBHOOK_HASH` must match the "secret hash" in the Flutterwave dashboard).
- [ ] Currencies enabled on the account: Paystack NGN; Flutterwave NGN, USD, GBP and EUR as the
      account allows; Stripe USD, GBP, EUR and NGN if the account supports it (otherwise disable Stripe
      for NGN in settings).
- [ ] Events to send: **Stripe** `checkout.session.completed`,
      `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
      `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`; **Paystack**
      `charge.success`, `refund.processed`, `refund.failed`, `charge.dispute.create` (Paystack
      sends all events to one URL); **Flutterwave** `charge.completed`.
- [ ] `OWNER_ALERT_EMAIL` set: amount mismatches, second payments, disputes, refunds made in a
      dashboard and refunds with an unknown outcome are emailed there and flagged on the order.
- [ ] Refunds are made **from the admin**, not the provider dashboard (a dashboard refund is
      detected and recorded for Stripe and Paystack, but the admin keeps everything consistent).
      Only the owner can refund.
- [ ] **A real small live transaction** per provider, then a refund of it. Confirm the order,
      receipt email, library entitlement and refund all behave correctly.
- [ ] The reconciliation job has run and logged a clean pass.

## 7. Database (Atlas)

- Production: a dedicated cluster (M10+) for **continuous backups with point-in-time restore**. Free
  or shared tiers have no PITR, which is unacceptable for payment records.
- Network access: Render's outbound IPs only (or Atlas private endpoints), never `0.0.0.0/0` in
  production.
- A database user per environment with least privilege (`readWrite` on its own database).
- Indexes are created on boot (`autoIndex: true`). Watch the first deploy after an index change on a
  large collection.
- Migrations (`migrate-mongo`, from BS-5) run automatically as Render's **pre-deploy command**
  (`npm run migrate:up`), after the build and before the new version takes traffic; a failing
  migration stops the deploy and the old version keeps serving. A lock stops two deploys migrating
  at once. Migrations must be backward-compatible with the running version (add, backfill, then
  remove in a later release), and the PR says when one is included. Check status with
  `npm run migrate:status`.

## 8. Release procedure

1. The PR is merged to `main` (CI green).
2. Vercel and Render auto-deploy from `main`.
3. Watch Render logs for boot and `/health`, and Vercel for the build.
4. Smoke test: home page, a book page, the preview reader, add to cart, and (on staging, for money
   changes) a full test-card purchase. After catalogue changes: edit a book in the admin and
   confirm the store shows it within seconds (revalidation works).
5. Rollback: Render "Rollback to previous deploy" / Vercel "Promote previous deployment". A
   migration that isn't backward-compatible must ship its `down` script tested.

## 9. Secrets

- Never commit them. `.env*` is gitignored except `.env.example`.
- Rotate immediately if one is exposed (pasted in chat, logged, or committed by mistake), and note the
  rotation in the PR or issue.
- `JWT_ACCESS_SECRET`: at least 32 random bytes (`openssl rand -base64 48`), different per
  environment. Rotating it signs everyone out of their current access token (refresh still works).
- `TWO_FACTOR_ENCRYPTION_KEY`: exactly 32 bytes (`openssl rand -base64 32`), different per
  environment. **Back it up in the owner's password manager.** Losing or changing it makes every
  enrolled authenticator unusable; staff would have to be reset by hand.
