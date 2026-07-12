# Daily Top Ten

Daily Top Ten is a pnpm/TypeScript monorepo containing the Hono API, React player, publisher workflow, and deterministic game engine.

## Prerequisites

- Node.js 22 and pnpm 10.13.1
- PostgreSQL 17 (or Docker Compose)
- Chromium for Playwright

Copy `.env.example` to `.env` and replace `AUTH_PEPPER`; never commit the populated file or production credentials.

## Local operation

```sh
pnpm install --frozen-lockfile
docker compose up -d postgres
createdb -h 127.0.0.1 -p 55432 -U d10net d10net_test
export DATABASE_URL=postgres://d10net@127.0.0.1:55432/d10net
export TEST_DATABASE_URL=postgres://d10net@127.0.0.1:55432/d10net_test
NODE_ENV=test pnpm seed:test
pnpm dev
```

The seed is deliberately unavailable unless `NODE_ENV=test`; it drops and recreates only the dedicated database's `public` schema. There is no HTTP seed endpoint. It inserts canonical day `2026-07-11`, guest and publisher identities, Daily/Archive boards, and an emergency board. Playwright global setup performs this reset automatically and writes ephemeral guest/account cookie states under ignored `tests/e2e/.auth/`.

## Content operations

Paste one or more boards using `docs/board-import-template.csv`, validate every preview, choose a publish date, and publish. Manual override is available for emergencies. Invoke random next-day scheduling with:

```sh
pnpm --filter @daily/api schedule:next-day -- --day 2026-07-12
```

Published versions are immutable; corrections create a new version and all publisher actions are audited.

## Release verification

```sh
pnpm typecheck && pnpm lint && pnpm --filter @daily/api drizzle-kit check && pnpm test && pnpm build && NODE_ENV=test pnpm seed:test && pnpm playwright test
```

Playwright starts the real API, consumer Vite app, and publisher Vite app. It covers the 390×700 Daily journey, Archive review and missed play isolation, invalid/date rollback, offline finish reconnect, partial-valid multi-board TSV publishing, schedule override and random scheduling, PostgreSQL effects, serious/critical axe checks, keyboard operation, and browser-computed accessible names.

`pnpm lint` is an independent ESLint flat-config gate for JavaScript, TypeScript, and TSX; it does not alias typechecking.
