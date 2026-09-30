# Book Selling Platform

Online bookstore for a mechanical engineering lecturer's own books, **ebook and print**, sold
worldwide in **NGN, USD, GBP and EUR** through **Paystack, Flutterwave and Stripe**. Visitors can
read each book's **abstract and introduction in an in-browser preview reader** before buying.

This file is the summary. Read the relevant doc before working in an unfamiliar area:
- `docs/PRODUCT_RULES.md`: what the product must do (preview, checkout, payment, email, messaging rules)
- `docs/ARCHITECTURE.md`: data model, money safety (§8), payments (§9), preview reader (§10), email (§11), design system (§6)
- `docs/ENGINEERING_RULES.md`: git workflow, definition of done, money rules, testing rules
- `docs/DEPLOYMENT.md`: environments, Vercel/Render/Atlas/Resend, provider go-live checklist
- `docs/ROADMAP.md`: ticket order, **next ticket number**, and the record of what shipped

## Stack

- **Backend** (`backend/`): NestJS 12 (**ESM**: relative imports end in `.js`), TypeScript strict,
  MongoDB via Mongoose 9, Vitest, oxlint. Deployed to **Render**. See `backend/CLAUDE.md`.
- **Frontend** (`frontend/`): Next.js 16 App Router, React 19, Tailwind v4 (CSS-first tokens),
  hand-built UI kit, Redux Toolkit + RTK Query, react-hook-form + Zod. Deployed to **Vercel**. See
  `frontend/CLAUDE.md`.
- Two independent apps, no workspace tooling. Email: Resend. Files: Cloudinary.
- Reference project with the same author and stack: `C:\Users\Goodnews\food_ordering_platform`. Its
  auth, payments and UI kit patterns were ported here. Look there when a pattern is unclear.

## Brand

**White and brown.** Warm paper whites, espresso/walnut brown primary, antique-gold accent,
Fraunces serif headlines with Inter body text: a "modern library" look. Tokens live in
`frontend/src/styles/tokens.css` (source of truth). Never hardcode a colour, size or font in a
component.

## Non-negotiable rules

1. **Never push to `main`.** It is protected. Every change goes on
   `feature/BS-<n>-<short-description>` (the next number is at the top of `docs/ROADMAP.md`), then a
   PR, then (once CI is green) Claude squash-merges it with `gh pr merge --squash --delete-branch`.
   Use the `new-feature-branch` skill.
2. **Money is sacred.** Integer minor units only. The server computes every total. **Only
   `PaymentsService.settle()` marks a payment received**, and only after a verified webhook or
   server-to-server verify **with an exact amount and currency match**. All state changes are
   conditional atomic updates; multi-document changes use transactions. Run the `money-path-review`
   skill before merging anything touching payments, orders, checkout, coupons or the library.
3. **Locked book pages never reach the browser before purchase.** The preview is a separate
   server-generated PDF.
4. **No secrets committed.** Real values live in `.env` (gitignored) or Vercel/Render settings. New
   env vars go into Joi validation, `.env.example` and `render.yaml` together.
5. **Every endpoint validates with a DTO; every form validates with Zod.** Guards are default-deny;
   ownership is checked in services.
6. **Frontend is tokens + UI kit only.** No raw colours, no one-off styled elements; extend the kit.
   Both themes, 375px width, keyboard-accessible.
7. **Definition of done** (ENGINEERING_RULES §2): lint, typecheck, build, unit and e2e tests pass in
   both apps, and the docs are updated (the ROADMAP row, and the ARCHITECTURE section touched).

## Repo structure

```
backend/     NestJS API: see backend/CLAUDE.md
frontend/    Next.js storefront and admin: see frontend/CLAUDE.md
docs/        product rules, architecture, engineering rules, deployment, roadmap
.claude/     project skills (new-feature-branch, money-path-review)
.github/     CI: the job names are the required checks on main
```
