# Engineering Rules

How we build. These rules apply to every change, including changes made by Claude Code sessions.
A rule with a "why" came from a real incident, mostly in the sister project `food_ordering_platform`.

## 1. Git workflow (non-negotiable)

- **`main` is protected.** No direct pushes (admins included), no force pushes, no deletion, linear
  history, and CI must pass. The only direct push ever made was the one-time README bootstrap commit
  on 2026-09-30, needed because GitHub can only protect a branch that exists.
- Every change goes on a branch named **`feature/BS-<n>-<short-kebab-description>`**, for example
  `feature/BS-7-cart-checkout-orders`. Use `fix/BS-<n>-…` for a bug fix if you like; the ticket
  number is what matters.
- `<n>` is the **"Next ticket number"** at the top of [`ROADMAP.md`](ROADMAP.md). Bump it in the
  same branch.
- Commit messages start with the ticket: `BS-7: reserve print stock atomically at order placement`.
- Open a PR against `main` with `gh pr create`. The body has a **Summary**, **Why**, and a
  **Test plan** listing the commands run and their results.
- Once CI is green, **Claude merges the PR itself** (`gh pr merge --squash --delete-branch`) and
  tells the user what shipped, with the PR link. This is the user's standing instruction as of
  2026-09-30, the same arrangement as the reference project. Stop and ask instead if CI fails and
  the fix isn't obvious, or if the change touches money flows in a way the docs don't already cover.
- Branch protection requires **0 approvals** (you can't approve your own PR), but requires the
  status checks `Backend (lint, build, test)` and `Frontend (lint, build, test)`. Renaming a CI job
  means updating branch protection too.
- Never commit secrets, `.env` files, database backups or real customer data.

## 2. Definition of done (every PR)

1. `backend`: `npm run lint`, `npx tsc --noEmit -p tsconfig.json`, `npm run build`, `npm test`,
   and `npm run test:e2e` all pass locally.
2. `frontend`: `npm run lint`, `npm test`, and `npm run build` all pass locally.
3. New behaviour has tests (§6). Money paths meet the payment test matrix.
4. The docs are updated (§8): the ROADMAP row, the ARCHITECTURE section it touched, and the
   CLAUDE.md files if a convention changed.
5. New env vars are in Joi validation, `.env.example` and `render.yaml` (or the Vercel list in
   DEPLOYMENT.md).
6. UI changes pass `npm run check:responsive` (320px → 1440px, **light and dark**, no page wider
   than the device, no console errors) against a production build. You look at the screenshots, and
   you walk the change with the keyboard only (frontend/CLAUDE.md "Responsive rules").

## 3. Code rules (both apps)

- TypeScript `strict`. No `any` in new code without a one-line justification comment. No
  `@ts-ignore`; `@ts-expect-error` only with a reason.
- Names say what things are. Comments explain **why**, not what.
- No dead code, no commented-out code, no `console.log` (use Nest's `Logger` on the backend).
- Small, single-purpose functions. Business rules in services or pure functions, never in
  controllers or components.
- Match the surrounding code's style. Prettier formats the backend; ESLint rules the frontend.

## 4. Backend rules

- **ESM**: relative imports end in `.js` (`import { X } from './x.js'`). This is NodeNext
  resolution, not a typo.
- **Every endpoint validates input with a DTO** (`class-validator`), with `@ApiProperty` on every
  field. No raw `req.body`. The global `ValidationPipe` uses `forbidNonWhitelisted`, so an unknown
  field is a 400.
- **Explicit response shapes**: never return a raw Mongoose document that includes secrets
  (`passwordHash`, token hashes, 2FA secrets, manuscript asset IDs).
- **Guards are default-deny** (from BS-4). A public route must say `@Public()`. Role checks use
  `@Roles()`; **ownership is checked in the service** ("is this *your* order").
- **ObjectId/string rule**: service methods take `id: string`, and conversion happens explicitly at
  the query boundary with the `common/utils/object-id.ts` helpers. *Why:* Mongoose ref fields built
  with `@Prop()` silently match zero documents when string and ObjectId are mixed. This cost the
  reference project real incidents (FDP-89, FDP-92).
- **Env vars**: add each to `common/config/env.validation.ts`, `.env.example` and `render.yaml` in
  the change that first reads it. The app refuses to boot on an invalid env.
- **Module wiring**: after adding or removing a module import or constructor dependency, run
  `npm run test:e2e`. *Why:* unit tests with hand-picked providers can't see a circular module
  dependency. The reference shipped one that crashed every production boot (FDP-115).
- **Schema changes**: a new optional field needs nothing. Renaming or removing a field, changing a
  type, or adding a unique index to a populated collection needs a migration (`migrate-mongo`,
  added in BS-5) and a note in the PR.
- **No `setTimeout` or in-memory queues for anything that must happen.** Use the outbox or a
  lease-locked scheduled job. Memory disappears on deploy.

## 5. Money rules (read before touching `payments`, `orders`, `checkout`, `coupons`, `library`)

1. **Money is an integer in minor units plus a currency code.** Never a float, never a major unit in
   the database. All arithmetic goes through `common/money/`.
2. **The server computes every price, discount, shipping fee and total.** Client-sent amounts are
   ignored.
3. **Only `PaymentsService.settle()` marks money as received.** It requires a verified webhook or a
   server-to-server verify, a matching provider, and an **exact amount and currency match**.
4. **Every state transition is a conditional atomic update** (`findOneAndUpdate` with the expected
   current state in the filter). No read-modify-write on status, stock, redemption counts or refund
   balances.
5. **Multi-document money changes run in a MongoDB transaction**, and emails triggered by them are
   written to the outbox **in the same transaction**.
6. **Idempotency everywhere**: `checkoutKey` on order placement, our own unique payment
   `reference`, the `webhook_events` unique index, outbox `dedupeKey`, and refund idempotency keys
   sent to providers.
7. **Ambiguous provider outcomes (timeouts, 5xx on a refund) are never retried automatically.**
   Flag `reconciliationRequired` and surface them in the admin "Needs attention" queue.
8. **Webhook handlers**: verify the signature against the raw body with `timingSafeEqual`, dedupe,
   return 2xx for anything verified (even if ignored), and never throw a 5xx at a provider.
9. **Never log** full card data (we never receive it anyway), secret keys, webhook secrets, or
   complete provider payloads containing customer PII. Log references and IDs.
10. **Test keys only** outside production. Production keys exist only in Render's env settings.

## 6. Testing rules

- Backend unit and service tests are colocated `*.spec.ts`. e2e tests live in
  `test/*.e2e-spec.ts` and **always** call `setupApp(app)` (otherwise the test runs without
  validation, the error filter or cookie parsing).
- Database tests use `mongodb-memory-server` (`MongoMemoryReplSet` when transactions are involved)
  with `launchTimeout: 60_000`. **Never mock Mongoose** for service logic; assert on real stored
  state.
- e2e files run serially (`fileParallelism: false`). Parallel mongod instances time out on slower
  machines.
- The first e2e run on a new machine downloads a ~550MB mongod binary (it took about 6 minutes on
  the dev machine). A first-run timeout is not a bug.
- Frontend tests are colocated `*.test.tsx`. Interactive components must test **keyboard
  behaviour**; accessible-name queries use regexes when a label wraps extra text.
- **Payment test matrix**: every item is required before BS-8 merges, and stays green forever.
  - Each adapter: initiate request shape (including the major/minor unit conversion), verify
    parsing, and a **valid signature accepted and an invalid or missing signature rejected**.
  - Settlement: success path; duplicate webhook (no second effect); webhook plus verify racing
    (exactly one settlement); **amount mismatch → not paid + flagged**; currency mismatch; provider
    mismatch; unknown reference; failure after success (no downgrade); late payment on an expired
    order (stock available / not available).
  - Concurrency: two parallel `settle()` calls → one success; two parallel checkouts for the last
    copy → one succeeds.
  - Refunds: full, partial, over-refund rejected, provider rejection reverts, timeout → `outcome_unknown`.
  - Outbox: a receipt is enqueued exactly once per paid order.
- **Preview leak tests** (BS-6): see ARCHITECTURE §15.

## 7. Frontend rules

- **Tokens only**: no hex, rgb, raw pixel values or font names in components. Use Tailwind
  utilities generated from `src/styles/tokens.css`. If a value is missing, add a token.
- **Semantic colours only** for anything visible in both themes (`bg-surface`, `text-text-muted`,
  `bg-primary`). Raw scales (`bg-brown-700`) are for theme-invariant cases only. *Why:* a dark-mode
  readability bug in the reference project came from raw scale classes.
- **UI kit only**: pages and features compose `src/components/ui` components. Need something new?
  Add it to the kit, with a test and a `/design-system` entry, first.
- **No `dark:` variants and no theme flags in components.** Themes swap token values.
- **State**: RTK Query for server data (one `api` instance, `injectEndpoints`), slices only for UI
  state. Typed hooks only.
- **Forms**: `react-hook-form` + Zod. Build mutation payloads explicitly (never pass the form values
  object).
- **RTK Query**: `try/catch` around `await queryFulfilled` in `onQueryStarted`.
- **Anything calling `/auth/refresh` directly must take the shared refresh mutex.**
- **Money display**: always through `PriceTag` or `formatMoney()` (`Intl.NumberFormat`), never
  string concatenation.
- **Server components by default** for public catalogue pages; `"use client"` only where
  interaction needs it.
- **Accessibility**: WCAG 2.2 AA (PRODUCT_RULES §14). Every image has meaningful `alt` or is marked
  decorative.
- **Next.js 16 is newer than most training data.** Read `frontend/node_modules/next/dist/docs/`
  for any API you're unsure of (see `frontend/AGENTS.md`).

## 8. Documentation rules

- `docs/ROADMAP.md` is the durable record of what shipped and why. Each ticket's row is written
  with real detail when the ticket finishes: what was built, what changed from the plan, and any
  incidents.
- `docs/ARCHITECTURE.md` sections are updated in the same PR that changes the behaviour they
  describe.
- `CLAUDE.md` (root, backend, frontend) holds only the short, always-needed rules and pointers.
  Details go in `docs/`.
- Record hard-won lessons (a bug that looked like something else, a tool quirk) in the relevant
  CLAUDE.md or doc section, with the ticket number, so the next session doesn't relearn them.

## 9. Security rules

- Validate all input, encode all output, and sanitise rich text on write.
- Secrets live only in env vars. Rotate any secret that has ever been printed, pasted or committed.
- Tighter rate limits on auth, preview, download and contact endpoints.
- Admin actions require 2FA and are audit-logged.
- Dependencies: keep `npm audit --omit=dev` clean. Upgrades go in their own PR.
