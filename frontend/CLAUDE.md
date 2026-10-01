@AGENTS.md

# Frontend conventions

Full design: `../docs/ARCHITECTURE.md` §6 (design system) and §7 (frontend architecture). Rules:
`../docs/ENGINEERING_RULES.md` §7. This file is the quick reference for working inside `frontend/`.

## Stack specifics

- **Next.js 16** App Router + React 19. Newer than most training data: read
  `node_modules/next/dist/docs/` before using an API you're not sure of (see `AGENTS.md`). Pages
  receive typed props (`PageProps<'/books/[slug]'>`, `LayoutProps<'/'>`), and `params` are async.
- **Tailwind v4, CSS-first.** There is no `tailwind.config.ts`. Tokens live in `src/styles/tokens.css`
  under `@theme` (imported by `src/app/globals.css`). Tokens outside Tailwind namespaces are used via
  the v4 variable shorthand: `z-(--z-modal)`, `duration-(--duration-base)`, `h-(--header-height)`.
- `cn()` (`src/lib/cn.ts`) extends tailwind-merge with our custom scale names (`text-2xs`,
  `shadow-book`). **Add any new custom size/shadow name there too**, or tailwind-merge will
  silently drop one of two classes it wrongly thinks conflict.
- Theme: `ThemeSync` + `themeSlice` + the inline bootstrap script from `src/lib/theme.ts`.
  Component tests needing Redux or toasts use `renderWithProviders` from `src/test/render.tsx`.
- **Browser API calls go to the relative `/api/*`**, which `next.config.ts` rewrites to the API
  (`getBackendUrl()` in `src/lib/backend-url.ts`). This keeps the refresh cookie first-party (Safari
  and private windows). Only server components and route handlers call `getBackendUrl()` directly.
- Tests: Vitest + React Testing Library (jsdom), colocated `*.test.ts(x)`. `npm test` for a single
  run, `npm run test:watch` to watch.

## Design rules (strict)

- **Tokens only**: no hex, rgb, pixel literals or font names in components. Use the utilities
  generated from tokens (`bg-surface`, `text-text-muted`, `bg-primary`, `rounded-lg`, `shadow-book`).
  Missing value? Add a token (light **and** both dark blocks) first.
- **Semantic colours only** for anything visible in both themes. Raw scales (`bg-brown-700`) never
  change in dark mode, so use them only for deliberately theme-invariant things.
- **No `dark:` variants and no theme flags in components.** Themes swap token values.
- **UI kit only** (`src/components/ui`, exported from `index.ts`): features and pages compose kit
  components. Need something new? Add it to the kit with a keyboard-behaviour test and a
  `/design-system` entry.
- Motion via tokens (`animate-rise-in`, `ease-out-soft`, 120–320 ms). The `motion` library is added only
  when a screen needs gesture or physics animation (e.g. the reader). `prefers-reduced-motion` is handled
  globally in `globals.css`.

## Responsive rules (most buyers are on phones)

- **Mobile-first from 320px.** Write the phone layout first, then widen with `sm:`/`md:`/`lg:`.
- Touch targets: 44px for standalone actions (Button `md`, IconButton `md`), 36px minimum in dense
  rows. Text inputs keep a 16px font (set globally) so iOS doesn't zoom on focus.
- Any row that could grow gets `flex-wrap` or a `grid-cols-1 sm:grid-cols-N` fallback. Wide content
  (tab strips, tables, chip rows) scrolls inside its own `overflow-x-auto` container.
- **Long words must never widen the page.** Headings are globally `overflow-wrap: anywhere;
  hyphens: auto`. Large display text outside a heading needs `wrap-anywhere hyphens-auto`. *Why:* in
  BS-2 the word "Thermodynamics" made the page 397px wide on a 375px phone, and the bottom sheet
  slid off-screen.
- Modals are bottom sheets on phones; footers stack full-width buttons (`flex-col-reverse`). Use
  `.safe-x` / `.safe-bottom` near screen edges.
- **Verify every UI change:** `npm run build && npx next start -p 3100`, then
  `npm run check:responsive -- <paths>` (Git Bash: prefix `MSYS_NO_PATHCONV=1`, or "/" becomes a
  Windows path). It loads each path at 320/375/414/768/1024/1440px in both
  themes and fails if the layout viewport is wider than the device or the console logs an error.
  Review the screenshots in `.responsive-shots/`. First run on a machine needs
  `npx playwright install chromium`.
- Self-positioned overlays clamp to the viewport. **Never put a portal-based control (DropdownMenu,
  Tooltip) inside a Modal/Drawer**: the modal backdrop paints over it. Use an inline control.

## Data rules

- One RTK Query `api` instance (`src/lib/api/api.ts`); features use `api.injectEndpoints()` in
  `src/lib/api/<area>-api.ts`. Server data never goes into a plain slice. Typed hooks only
  (`useAppDispatch`/`useAppSelector`). Response types live in `src/lib/api/types.ts`.
- `try/catch` around `await queryFulfilled` inside `onQueryStarted`.
- Build mutation payloads explicitly. Never pass a form's values object (the backend rejects unknown
  fields with a 400).
- Show API errors with `errorMessage(error)` / `errorCode(error)` (`src/lib/api/errors.ts`).
- **Session**: `state.session` = `{ status: 'checking' | 'authenticated' | 'anonymous', user,
  accessToken }`. Render nothing account-specific while `checking` (use a Skeleton), so "Sign in"
  never flashes for a signed-in visitor. Signed-in pages wrap in `RequireAuth`. Redirect targets go
  through `safeNextPath()` (no open redirects).
- Anything calling `/auth/refresh` directly must hold `refreshMutex` and use `renewSession()`, never
  the reauth wrapper (it would wait on its own lock and deadlock). See `restoreSession` in
  `auth-api.ts`.
- Forms: react-hook-form + Zod schemas in `src/features/<area>/schemas.ts`. Password rules mirror
  the backend in `src/lib/password.ts`; keep them in step.
- Modals and drawers make everything else `inert` while open (`use-dialog.ts`), except the toast
  region and Next's route announcer. Playwright's role queries still see inert elements, so use
  exact names in scripts.
- Money is displayed only through `PriceTag` / `formatMoney()`. Amounts from the API are integer
  minor units.
- Public catalogue pages are server components. Use `"use client"` only where needed.

## Local dev

```
npm run dev          # http://localhost:3000 (API expected at http://localhost:4000)
npm run lint
npm test
npm run build        # production build; set CI=true locally if API_URL isn't set (API_URL is baked in at build)
```
