# Backend conventions

Full design: `../docs/ARCHITECTURE.md`. Rules: `../docs/ENGINEERING_RULES.md` §4–6. This file is the
quick reference for working inside `backend/`.

## Stack specifics (NestJS 12, newer than the reference project's Nest 11)

- **ESM** (`"type": "module"`, `module: nodenext`). Relative imports **must** end in `.js`
  (`import { X } from './x.js'`), including in tests. A missing suffix fails at runtime, not always
  at typecheck.
- **Vitest**, not Jest: `describe`/`it`/`expect`/`vi` are globals. Use `vi.fn()`/`vi.spyOn()`.
  `npm test` runs `src/**/*.spec.ts`; `npm run test:e2e` runs `test/**/*.e2e-spec.ts` (separate
  config, files run serially).
- **oxlint** (`npm run lint`, type-aware), not ESLint. Prettier formats (`npx prettier --write src
  test`).
- Env is validated with Joi at boot (`src/common/config/env.validation.ts`). A new var goes there,
  in `.env.example` and in `../render.yaml` in the same change.
- Logging: `nestjs-pino`. Use Nest's `Logger`, never `console.log`. Silent in `NODE_ENV=test`.
- `setupApp()` (`src/setup-app.ts`) applies helmet, cookies, CORS, `ValidationPipe`
  (`whitelist` + `forbidNonWhitelisted` + `transform`), `AllExceptionsFilter` and `trust proxy 1`.
  `main.ts` adds Swagger (`/api/docs`) and `rawBody: true` (webhook signatures).
- Global `ThrottlerGuard` (100/min). Add tighter `@Throttle()` per sensitive route. Payment webhooks
  use `@SkipThrottle()`.
- Error responses always have the shape `{ statusCode, timestamp, path, message }`. 5xx messages are
  generic (details are logged, never returned).

## Module layout

One module per domain in `src/<domain>/` (`<domain>.module.ts`, `.controller.ts`, `.service.ts`,
`dto/`, `schemas/`, colocated `*.spec.ts`). `src/common/` holds cross-cutting code only (config,
filters, decorators, `money/`, `utils/`). The module map and ticket per module are in ARCHITECTURE §3.

## Mongoose rules

- Service methods take `id: string`. Convert at the query boundary with the `common/utils/object-id`
  helpers. **Never mix string and ObjectId on a ref field**: a query silently matches zero documents
  (the reference project's FDP-89/FDP-92 incidents).
- Status, stock, balances and counters change **only** through conditional atomic updates
  (`findOneAndUpdate({ _id, status: expected }, …)`), never read-modify-write.
- Money paths use transactions (`connection.transaction(async (session) => …)`), which need a
  replica set: `MongoMemoryReplSet` in tests, and Atlas or a local `--replSet rs0` in dev.
- Declare every index on the schema. Unique indexes are correctness guarantees (payment reference,
  webhook dedupe, one success per order), not optimisations.
- Never return a raw document containing secrets. Map to a response DTO.

## Auth and access (BS-4, ARCHITECTURE §5)

- **Default-deny**: every route needs a valid access token. Mark public routes `@Public()`
  (`common/decorators/public.decorator.ts`). On a public route that personalises, read
  `@OptionalUser()`; on protected routes `@CurrentUser()` gives the token claims
  (`sub`, `role`, `mfa`, `sid`).
- `@Roles('admin', 'owner')` for staff routes. `RolesGuard` also requires an `mfa` session for
  staff, so no extra check is needed. **Ownership ("is this your order") is checked in the service**,
  never assumed from the role.
- Users: never return a document directly. Map with `toPublicUser()` (secrets are `select: false`).
  Auth code that needs secrets uses `findByEmailWithSecrets` / `findByIdWithSecrets`.
- Guest checkout gets the buyer account with `UsersService.findOrCreateForGuest(email, name,
  session)` and, after the order, `AuthService.sendClaimLink(user, orderNumber)`.
- Record admin and security actions with the global `AuditService.record()`.
- Passwords: bcrypt with `BCRYPT_COST` (tests 4, production ≥ 12). Never hard-code the cost.
- New dependencies must have a permissive licence (`node ../scripts/check-licenses.mjs`; CI runs
  it). ua-parser-js 2.x was AGPL and was removed.

## Email, jobs and webhooks (BS-3)

- **Never call an email provider directly.** Use `MailService.enqueue()` with a `dedupeKey`
  that identifies the business event, and pass the caller's `session` when inside a transaction.
  New email = a component in `src/mail/templates/`, registered in `registry.tsx` with `category`,
  `sensitive` (true if it carries a one-time link) and a `sample`. The render test and
  `npm run email:preview` pick it up automatically.
- **Scheduled work** uses `@Interval`/`@Cron` + `JobLockService.runExclusive(name, leaseMs, fn)`,
  so only one API instance runs it. Timers are skipped when `NODE_ENV=test`; tests call the job's
  method directly with an injected `now`.
- **Webhooks**: `@Public()` (from `common/decorators/public.decorator.ts`) + `@SkipThrottle()`.
  Verify the signature against `req.rawBody` (main.ts `rawBody: true`) before anything else. Reject
  with 401. After verification, always 2xx and log processing errors.
- **`svix` 2.x `Webhook.verify()` returns `undefined`** (v1 returned the parsed payload). Verify,
  then `JSON.parse` the raw body yourself. Type-checking didn't catch this; only the e2e test did
  (BS-3).

## Testing

- The e2e specs are the **only** check that the real `AppModule` wiring boots (circular module
  dependencies pass every unit test and still crash production). Run `npm run test:e2e` after any
  change to module imports or constructor dependencies.
- e2e specs **always** boot through `createTestApp()` (`test/app.ts`). It starts an in-memory
  replica set, applies `applyTestEnv()` (extend `test/test-env.ts` when you add a required env var),
  dynamically imports `AppModule` after the env is set, creates the app with `rawBody: true` (as
  main.ts does; webhook signatures need it), and calls `setupApp()`. Don't hand-roll this in a spec.
- Service specs that need a database use `startMongo()` (`test/mongo.ts`, a single-node
  **replica set** so transactions work) plus a `Test.createTestingModule` with
  `MongooseModule.forRoot(uri)`. Call `model.syncIndexes()` in `beforeAll` when a test relies on a
  unique index.
- Time-based tests inject `now` and step the clock **past the maximum jittered delay**. A 7h step
  against a 6h+20%-jitter backoff was flaky in BS-3.
- The first run on a new machine downloads a ~550MB mongod binary (about 6 minutes). A timeout on
  that first run is not a bug.
- Never mock Mongoose for service logic. Assert on real stored state.
- Every webhook handler has a test that rejects an invalid signature. The full payment test matrix is
  in ENGINEERING_RULES §6.

## Local dev

```
npm run start:dev   # http://localhost:4000  ·  /health  ·  /api/docs
npm run lint
npx tsc --noEmit -p tsconfig.json
npm run build
npm test
npm run test:e2e
```
