# Deployment Rules

Hosting: **Vercel** (frontend), **Railway** (API), **MongoDB Atlas** (database), **Resend** (email),
**Cloudinary** (images), **Cloudflare R2** (private book PDFs), and payment providers **Paystack**, **Flutterwave**
and **Stripe**. The production go-live is ticket BS-14. Until then, this document is the plan and the
checklist.

## 1. Environments

| Environment | Frontend | API | Database | Payment keys |
|---|---|---|---|---|
| Local | `localhost:3000` | `localhost:4000` | local replica set or an Atlas dev cluster | **test** |
| Preview | Vercel preview per PR | (shared staging API) | Atlas `book_selling_staging` | **test** |
| Staging | `staging.<domain>` | Railway `book-selling-api-staging` | Atlas `book_selling_staging` | **test** |
| Production | `<domain>` | Railway `book-selling-api` → `api.<domain>` | Atlas `book_selling` (dedicated cluster) | **live** |

Rules:
- **Live payment keys exist only in the production Railway service.** Never in `.env` files, never on
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
  (`src/lib/backend-url.ts`), so we never ship a storefront pointing at localhost. A value that
  isn't an address (e.g. a placeholder left in) fails with a message naming the variable.
- `NEXT_PUBLIC_SITE_URL` unset or empty falls back to the address Vercel gives the project
  (`VERCEL_PROJECT_PRODUCTION_URL`); set it explicitly once there is a custom domain.
- Live updates (messages, the bell) connect **straight to `API_URL`** with Socket.IO, because
  Vercel rewrites can't carry WebSockets. The address is baked in at build time
  (`NEXT_PUBLIC_REALTIME_URL` in `next.config.ts`), so **redeploy the frontend after changing
  `API_URL`**. The API must list the site in `CORS_ORIGINS` (it already must for the HTTP API).
- Domains: `<domain>` (primary) and `www.<domain>` → redirect to the primary.

## 4. API on Railway

Chosen over Render by the owner (BS-24). The browser's HTTP calls go through Vercel's `/api`
rewrite, so cookies stay first-party. The one direct connection is the live-updates socket
(Socket.IO, BS-10), which authenticates with the access token instead of a cookie. Railway
supports WebSockets with no setting. **Keep one instance**: rooms live in memory, and a second
instance needs the Socket.IO Redis adapter first (ARCHITECTURE §12).

**Setup (dashboard, once per environment):**
1. Railway → New Project → **Deploy from GitHub repo** → this repository. In the service's
   Settings: **Root Directory `backend`**, and **Config-as-code path `/backend/railway.json`**
   (Railway doesn't look for it inside the root directory). It defines: build
   `npm ci --include=dev && npm run build` (`--include=dev` because `NODE_ENV=production` would
   otherwise skip the build tools), **pre-deploy `npm run migrate:up`**, start
   `npm run start:prod`, health check `/health`, restart on failure. Node 24 comes from
   `engines` in `package.json`.
2. Settings → Networking → **Generate Domain** (later a custom domain `api.<domain>`). That URL is
   the frontend's `API_URL` and the base of every provider webhook. **The domain's port must be the
   port the API listens on**: Railway gives the app a `PORT` (usually 8080) and the deploy log
   prints "API listening on port N". A different port there gives "Application failed to respond"
   while the deploy itself looks healthy.
3. Variables → **Raw Editor**: paste the production variables (table below; locally, a filled
   `backend/.env.railway` is gitignored). Railway sets `PORT` itself.
4. Deploys follow `main`: merging a PR is the release. A failing migration or health check stops
   the deploy and the previous version keeps serving.

**Production variables** (the list must match `backend/src/common/config/env.validation.ts`; a
missing required one stops the API booting, and the deploy fails its health check instead of
serving errors):

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `TRUST_PROXY_HOPS` | `2` (Vercel's rewrite + Railway's edge; otherwise every visitor shares one rate limit) |
| `MONGODB_URI` | Atlas `mongodb+srv://…/book_selling?retryWrites=true&w=majority` (§7) |
| `CORS_ORIGINS`, `FRONTEND_URL` | the storefront's origin, e.g. `https://<project>.vercel.app` |
| `JWT_ACCESS_SECRET` | new, ≥32 random bytes, per environment (§9) |
| `TWO_FACTOR_ENCRYPTION_KEY` | new, exactly 32 bytes base64, per environment; **back it up** (§9) |
| `BCRYPT_COST` | `12` |
| `FRONTEND_REVALIDATE_SECRET` | 16+ random characters; the **same** value as Vercel's `REVALIDATE_SECRET` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from Cloudinary (§4a) |
| `CLOUDINARY_FOLDER` | `book-selling/production` (`book-selling/staging` on staging) |
| `IMAGE_MAX_MB` | `10` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | from Cloudflare R2 (§4b) |
| `R2_FOLDER` | `book-selling/production` (`book-selling/staging` on staging) |
| `R2_STORAGE_LIMIT_MB` | unset in production; e.g. `2048` while testing on a personal account |
| `MANUSCRIPT_MAX_MB` | `200` (keep the instance's RAM at 4× this) |
| `PREVIEW_MAX_PERCENT` | `15` |
| `BRAND_NAME`, `SUPPORT_EMAIL`, `BUSINESS_POSTAL_ADDRESS` | the store's name, support inbox, postal address |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MAIL_FROM`, `MAIL_REPLY_TO` | §5 |
| `OWNER_ALERT_EMAIL` | the owner's own inbox |
| `PAYMENTS_MODE` | `live` in production only; `test` everywhere else (§6) |
| `PAYSTACK_SECRET_KEY`, `FLUTTERWAVE_SECRET_KEY`, `FLUTTERWAVE_WEBHOOK_HASH` | from each dashboard (§6) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_COUNTRIES` | only where the business may use Stripe (§6) |
| `PAYSTACK_CURRENCIES`, `FLUTTERWAVE_CURRENCIES` | what each account accepts, e.g. `NGN` and `NGN,USD,GBP,EUR` |

- **Plan and memory**: Railway Hobby ($5/month including $5 of usage, then usage-based) runs an
  always-on service; webhooks and the background jobs need one. Building a preview or a buyer's
  copy holds the whole PDF in memory, so allow about 4× `MANUSCRIPT_MAX_MB` (Railway scales memory
  per service up to the plan's limit).
- Scheduled jobs run inside the API process with lease locks, so more than one replica is safe.
- **First deploy of each environment**: register the lecturer's account on the site, then run
  `npm run seed:owner -- <their email>` once (Railway shell, or locally with that environment's
  `MONGODB_URI`). The owner must then turn on two-step verification before any store management
  page opens. Admins are added by the owner from the admin area; the owner role is never granted
  through the API.
- **After the first deploy**, check the real-IP setting: sign in on the site and open Account →
  Security; the session must show your own IP address, not a Vercel or Railway one.

### Showcase catalogue on a hosted site (BS-27)

For a demo, `seed:demo` can fill a hosted site with 12 foundry and heat-treatment titles (tagged
`demo`, removable with `--remove`). Run it from a machine with the repository, pointing at that
site's database and R2 folder, with `--live`:

```
cd backend && npm run seed:demo -- --live    # with MONGODB_URI, R2_FOLDER, FRONTEND_URL and
                                             # FRONTEND_REVALIDATE_SECRET set to the site's values
```

It uploads the full books, so demo purchases can be read, and stops background jobs at once.
Remove the demo books (`npm run seed:demo -- --remove --live`) before real launch.

## 4a. Cloudinary (images)

1. One Cloudinary account; the **free plan** is enough (25 credits a month, images up to 10MB). Book
   PDFs are not stored here (§4b).
2. Railway variables: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (required in
   production; the API will not boot without them) and `CLOUDINARY_FOLDER`: a different folder per
   environment (`book-selling/production`, `book-selling/staging`, locally
   `book-selling/development`). The abandoned-upload cleanup only ever touches its own folder.
   `IMAGE_MAX_MB` must not exceed the plan's image limit (10 on the free plan).
3. Cloudinary console → Settings → Security: keep **"Strict transformations"** off (the storefront
   requests sizes on the fly).
4. **Memory for book PDFs**: attaching a book PDF and building its preview load the whole file
   (BS-6, BS-20). Give the API service about 4× the largest book in RAM: 2GB suits
   the default `MANUSCRIPT_MAX_MB=200`; Starter (512MB) only books up to about 100MB (set
   `MANUSCRIPT_MAX_MB=100`). A build that runs out of memory restarts the instance and is retried.

## 4b. Cloudflare R2 (private book PDFs)

1. Cloudflare dashboard → **R2 Object Storage** → enable it (a card is needed; the first 10GB of
   storage and all downloads are free, then $0.015 per GB-month).
2. **Create a bucket** per environment, e.g. `book-selling-production` and
   `book-selling-development` (location: automatic). Leave **public access off**: nothing in it
   is ever public.
3. Bucket → Settings → **CORS policy**. The editor's browser uploads pieces straight to R2 and the
   page picker reads ranges of the file, so allow the storefront origin(s):
   ```json
   [
     {
       "AllowedOrigins": ["https://<domain>", "http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type", "Range"],
       "ExposeHeaders": ["ETag", "Accept-Ranges", "Content-Range", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   (Leave `localhost` out of the production bucket's list.)
4. R2 → **Manage API tokens** → Create API token: permission **Object Read & Write**, applied to
   **that bucket only**. Copy the Access Key ID and Secret Access Key (shown once) and the Account
   ID (R2 overview page).
5. Railway variables: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (required
   in production) and `R2_FOLDER` (`book-selling/production`). Locally the same five go in
   `backend/.env` with the development bucket; without them, book PDF uploads answer 503.
   When developing on **your own** Cloudflare account, also set `R2_STORAGE_LIMIT_MB=2048`: book
   PDF uploads that would take the folder past 2GB are refused with a clear message, so testing
   never leaves the free 10GB. Production leaves it unset (BS-21).
6. Incomplete uploads: our cleanup job aborts them after a day, and R2 also aborts any multipart
   upload left open for 7 days by default.
7. Smoke test on staging: upload a cover (crop it), a sample page and a 50MB+ PDF from a phone;
   switch the network off mid-upload and on again (the upload continues); choose the free preview
   pages from the thumbnails and wait for "Ready"; open the reader on a phone and check that it
   ends in the "Continue reading" card with two blurred page hints, and that no R2 link appears in
   the visitor's browser.

## 5. Email (Resend)

1. Add the sending domain (e.g. `mail.<domain>`) in Resend and create the **SPF, DKIM and DMARC**
   DNS records it lists. Start DMARC with `p=none; rua=…`, then move to `quarantine` once reports
   are clean.
2. Railway variables: `RESEND_API_KEY` (a sending-only key), `MAIL_FROM` =
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
- [ ] `PAYMENTS_MODE=live` and the live secret key set in production Railway only;
      `PAYMENTS_MODE=test` and test keys on staging. The API refuses to boot if a key doesn't match
      the mode, so live keys can't end up on staging or a laptop.
- [ ] To switch a provider off (for example Stripe until there is a supported company), leave its
      keys empty: it is simply not offered.
- [ ] Stripe also needs `STRIPE_COUNTRIES`: only the buyer countries where the business's Stripe
      account may lawfully take payments (the API refuses to start without it). Stripe is never
      offered for NGN.
- [ ] Webhook URL set in the **live** dashboard:
      `https://api.<domain>/payments/webhooks/stripe` · `/paystack` · `/flutterwave`
- [ ] Webhook secret set (`STRIPE_WEBHOOK_SECRET`; Paystack signs with the secret key;
      `FLUTTERWAVE_WEBHOOK_HASH` must match the "secret hash" in the Flutterwave dashboard).
- [ ] Currencies enabled on the account: Paystack NGN; Flutterwave NGN, USD, GBP and EUR as the
      account allows; Stripe USD, GBP and EUR (never NGN). Set `PAYSTACK_CURRENCIES` and
      `FLUTTERWAVE_CURRENCIES` to exactly what each account accepts (a provider is only offered for
      those): Paystack says "Currency not supported by merchant" for a currency it hasn't enabled.
- [ ] **Account limits lifted**: a Flutterwave account that isn't approved to go live refuses
      payments above a small amount ("Merchant limit is set at 3000 pending go live", seen in test
      mode, BS-23). Complete each provider's business verification (KYC) before launch, then make one
      real payment and refund per provider.
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
- Network access: Railway has no fixed outbound IPs on the Hobby plan, so Atlas must allow
  `0.0.0.0/0` there, protected by a long random password for a database user limited to this one
  database. For production, use Railway's static outbound IPs (Pro) and allow only those.
- A database user per environment with least privilege (`readWrite` on its own database).
- Indexes are created on boot (`autoIndex: true`). Watch the first deploy after an index change on a
  large collection.
- Migrations (`migrate-mongo`, from BS-5) run automatically as Railway's **pre-deploy command**
  (`npm run migrate:up`), after the build and before the new version takes traffic; a failing
  migration stops the deploy and the old version keeps serving. A lock stops two deploys migrating
  at once. Migrations must be backward-compatible with the running version (add, backfill, then
  remove in a later release), and the PR says when one is included. Check status with
  `npm run migrate:status`.

## 8. Release procedure

1. The PR is merged to `main` (CI green).
2. Vercel and Railway auto-deploy from `main`.
3. Watch Railway's deploy logs for the migration, boot and `/health`, and Vercel for the build.
4. Smoke test: home page, a book page, the preview reader, add to cart, and (on staging, for money
   changes) a full test-card purchase. After catalogue changes: edit a book in the admin and
   confirm the store shows it within seconds (revalidation works).
5. Rollback: Railway "Redeploy" of the previous deployment / Vercel "Promote previous deployment". A
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
