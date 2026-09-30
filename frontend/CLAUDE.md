@AGENTS.md

# Frontend conventions

Full design: `../docs/ARCHITECTURE.md` §6 (design system) and §7 (frontend architecture). Rules:
`../docs/ENGINEERING_RULES.md` §7. This file is the quick reference for working inside `frontend/`.

## Stack specifics

- **Next.js 16** App Router + React 19. Newer than most training data: read
  `node_modules/next/dist/docs/` before using an API you're not sure of (see `AGENTS.md`). Pages
  receive typed props (`PageProps<'/books/[slug]'>`, `LayoutProps<'/'>`), and `params` are async.
- **Tailwind v4, CSS-first.** There is no `tailwind.config.ts`. Tokens live in `src/styles/tokens.css`
  under `@theme` (from BS-2; BS-1 has a seed palette in `globals.css`).
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
- Mobile-first. Every page works at 375px. Touch targets are 44px for standalone icon actions.
- Self-positioned overlays clamp to the viewport. **Never put a portal-based control (DropdownMenu,
  Tooltip) inside a Modal/Drawer**: the modal backdrop paints over it. Use an inline control.
- Motion via `motion`, 120–320 ms, and always respects `prefers-reduced-motion`.

## Data rules

- One RTK Query `api` instance; features use `api.injectEndpoints()`. Server data never goes into a
  plain slice. Typed hooks only (`useAppDispatch`/`useAppSelector`).
- `try/catch` around `await queryFulfilled` inside `onQueryStarted`.
- Build mutation payloads explicitly. Never pass a form's values object (the backend rejects unknown
  fields with a 400).
- Anything calling `/auth/refresh` directly must take the shared refresh mutex from the api module,
  or it races the 401-retry path and logs the user out.
- Money is displayed only through `PriceTag` / `formatMoney()`. Amounts from the API are integer
  minor units.
- Public catalogue pages are server components. Use `"use client"` only where needed.

## Local dev

```
npm run dev          # http://localhost:3000 (API expected at http://localhost:4000)
npm run lint
npm test
npm run build        # production build; set CI=true locally if API_URL isn't set
```
