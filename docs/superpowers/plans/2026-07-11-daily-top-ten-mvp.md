# Daily Top Ten MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deployable static-first mobile trivia PWA, authoritative API, and desktop board publisher for the approved Daily Top Ten MVP.

**Architecture:** Use a pnpm TypeScript monorepo with a Preact/Vite PWA, a Hono API, shared contracts and deterministic game rules, and PostgreSQL persistence through Drizzle. Guess validation runs locally against an obfuscated play payload for responsiveness and offline continuity; this is deliberately cheat-resistant rather than secret because a closed universe makes client-side answers enumerable. The API replays every submitted guess against the authoritative board and remains authoritative for dates, elapsed time, results, streaks, rankings, accounts, and publishing.

**Tech Stack:** Node.js 22, pnpm 10, TypeScript 5, Preact 10, Vite 7, vite-plugin-pwa, Hono 4, Zod 4, Drizzle ORM, PostgreSQL 17, Vitest 3, Testing Library, Playwright 1.55.

## Global Constraints

- The active board counter displays answers found out of 10; only the final point score can reach 11.
- Each board has exactly ten ranked answers drawn from a closed universe.
- A canonical candidate is removed after submission and cannot be guessed twice.
- The optional “I think this is #1 (+1)” call can be consumed once and has no miss penalty.
- Five strikes or all ten answers ends a board.
- Hints On provides exactly one free hint; Hints Off provides none.
- Time runs continuously from the server-issued start and never pauses in the background.
- Rankings sort by score descending, elapsed time ascending, then accepted completion ascending, with separate Hints On and Hints Off pools.
- Archive plays never affect Daily rankings or streaks.
- The server defines the canonical game day and never accepts backward Daily progression.
- No network round trip is required per guess.
- Threat model: casual DevTools inspection should not reveal a plainly labeled answer list, but determined players can enumerate a closed client-side universe; authoritative replay, server timing, rate limits, and anomaly flags protect public rankings rather than pretending client answers are secret.
- Future-board confidentiality is a hard boundary: before its canonical publication day, no board title, prompt, tags, universe, aliases, sources, validation envelope, answers, or schedule assignment may appear in public APIs, HTML, JavaScript, source maps, preload data, PWA precaches, runtime caches, or service-worker update payloads.
- The compact mobile board shows all ten slots in two columns in a 390 × 700 CSS-pixel viewport.
- Use system fonts, subtle elevation, restrained motion, dark mode, reduced-motion support, and accessible touch targets.
- Rewarded ads, tokens, additional hints, multiplayer, themed sub-games, open universes, and live content APIs are out of scope.

---

## File Structure

```text
apps/
  api/src/
    app.ts                 Hono routes and middleware composition
    auth.ts                guest/account identity boundary
    date-policy.ts         canonical date and rollback protection
    plays.ts               start/result transaction service
    rankings.ts            Daily ranking queries
    publisher.ts           import, validation, lifecycle, scheduling
    db/schema.ts            PostgreSQL schema
    index.ts                server entrypoint
  publisher/src/
    App.tsx                 desktop paste/preview/publish interface
    api.ts                  publisher API client
  web/src/
    app.tsx                 player route shell
    game/GameScreen.tsx     compact active-board screen
    game/SearchPicker.tsx   remaining-universe search and selection
    game/useGame.ts         reducer persistence and sync orchestration
    archive/Archive.tsx     review and missed-board play
    results/Results.tsx     score, stats, streaks, share
    styles/tokens.css       Soft Depth design tokens
    styles/game.css         compact responsive board styles
packages/
  contracts/src/index.ts    Zod API and board contracts
  game/src/engine.ts        deterministic rules reducer
  game/src/search.ts        alias normalization and candidate search
  game/src/scoring.ts       score/result derivation
  game/src/streaks.ts       streak state transitions
  test-data/src/boards.ts   valid and invalid fixtures
tests/e2e/                  Playwright player and publisher journeys
```

## Task 1: Monorepo Foundation and Shared Contracts

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/index.test.ts`
- Create: `packages/test-data/src/boards.ts`

**Interfaces:**
- Produces: `Board`, `PlayStart`, `GuessEvent`, `PlayResult`, `HintMode`, `BoardImportRow`, and their Zod schemas.
- Produces: `validCitiesBoard` fixture used by all later tasks.

- [ ] **Step 1: Create workspace configuration**

```json
{
  "name": "daily-top-ten",
  "private": true,
  "packageManager": "pnpm@10.13.1",
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "dev": "pnpm --parallel --filter './apps/*' dev"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 2: Write failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { BoardSchema } from "./index";
import { validCitiesBoard } from "@daily/test-data/boards";

describe("BoardSchema", () => {
  it("accepts exactly ten ranked answers from the universe", () => {
    expect(BoardSchema.parse(validCitiesBoard).ranked).toHaveLength(10);
  });

  it("rejects a ranked answer missing from the universe", () => {
    const invalid = { ...validCitiesBoard, ranked: [...validCitiesBoard.ranked.slice(0, 9), "missing"] };
    expect(() => BoardSchema.parse(invalid)).toThrow(/universe/i);
  });
});
```

- [ ] **Step 3: Run the contract test and verify failure**

Run: `pnpm vitest packages/contracts/src/index.test.ts --run`

Expected: FAIL because `BoardSchema` and the fixture do not exist.

- [ ] **Step 4: Implement exact shared schemas**

```ts
import { z } from "zod";

export const HintModeSchema = z.enum(["on", "off"]);
export type HintMode = z.infer<typeof HintModeSchema>;

export const BoardSchema = z.object({
  id: z.string().min(1), version: z.number().int().positive(), gameDay: z.string().date().nullable(),
  title: z.string().min(1), metric: z.string().min(1), tags: z.array(z.string()).min(1),
  sources: z.array(z.object({ name: z.string(), url: z.string().url() })).min(1),
  universe: z.array(z.object({ id: z.string(), label: z.string(), aliases: z.array(z.string()), metricValue: z.string().max(80).optional() })).min(10),
  ranked: z.array(z.string()).length(10)
}).superRefine((board, context) => {
  const ids = new Set(board.universe.map((candidate) => candidate.id));
  for (const id of board.ranked) {
    if (!ids.has(id)) context.addIssue({ code: "custom", message: `Ranked answer ${id} is absent from universe` });
    if (!board.universe.find((candidate) => candidate.id === id)?.metricValue) context.addIssue({ code: "custom", message: `Ranked answer ${id} requires a metric value` });
  }
});
export type Board = z.infer<typeof BoardSchema>;

export const PlayStartSchema = z.object({ playId: z.string().uuid(), gameDay: z.string().date(), boardId: z.string(), boardVersion: z.number().int().positive(), startedAt: z.string().datetime(), mode: z.enum(["daily", "archive"]), hintMode: HintModeSchema, validationEnvelope: z.string() });
export type PlayStart = z.infer<typeof PlayStartSchema>;

export const GuessEventSchema = z.object({ candidateId: z.string(), calledNumberOne: z.boolean(), atMs: z.number().int().nonnegative() });
export type GuessEvent = z.infer<typeof GuessEventSchema>;

export const PlayResultSchema = z.object({ playId: z.string().uuid(), guesses: z.array(GuessEventSchema), hintUsed: z.boolean(), finishedAt: z.string().datetime() });
export type PlayResult = z.infer<typeof PlayResultSchema>;
```

- [ ] **Step 5: Add a 50-candidate city fixture and run tests**

Run: `pnpm vitest packages/contracts/src/index.test.ts --run`

Expected: PASS, 2 tests.

- [ ] **Step 6: Commit the contract boundary**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json packages/contracts packages/test-data
git commit -m "chore: establish shared trivia contracts"
```

## Task 2: Deterministic Game Engine and Search

**Files:**
- Create: `packages/game/src/engine.ts`
- Create: `packages/game/src/engine.test.ts`
- Create: `packages/game/src/search.ts`
- Create: `packages/game/src/search.test.ts`
- Create: `packages/game/src/scoring.ts`

**Interfaces:**
- Consumes: `Board`, `GuessEvent`, `HintMode` from `@daily/contracts`.
- Produces: `createGame(board, hintMode)`, `submitGuess(state, candidateId, callNumberOne)`, `useHint(state)`, `searchRemaining(state, query)`, and `deriveResult(state)`.

- [ ] **Step 1: Write failing engine tests for all scoring invariants**

```ts
it("removes guessed candidates and awards at most 11 points", () => {
  let state = createGame(validCitiesBoard, "off");
  state = submitGuess(state, validCitiesBoard.ranked[0], true);
  expect(state.availableIds).not.toContain(validCitiesBoard.ranked[0]);
  expect(() => submitGuess(state, validCitiesBoard.ranked[0], false)).toThrow(/unavailable/i);
  for (const id of validCitiesBoard.ranked.slice(1)) state = submitGuess(state, id, false);
  expect(deriveResult(state)).toMatchObject({ answersFound: 10, score: 11, completed: true });
});

it("consumes the number-one call once without penalizing a miss", () => {
  let state = createGame(validCitiesBoard, "off");
  state = submitGuess(state, validCitiesBoard.ranked[4], true);
  expect(state.strikes).toBe(0);
  expect(() => submitGuess(state, validCitiesBoard.ranked[0], true)).toThrow(/already used/i);
});

it("ends after five valid non-top-ten guesses", () => {
  let state = createGame(validCitiesBoard, "off");
  for (const id of state.availableIds.filter((id) => !validCitiesBoard.ranked.includes(id)).slice(0, 5)) state = submitGuess(state, id, false);
  expect(deriveResult(state)).toMatchObject({ strikes: 5, completed: true });
});
```

- [ ] **Step 2: Run engine tests and verify failure**

Run: `pnpm vitest packages/game/src/engine.test.ts --run`

Expected: FAIL because game functions are undefined.

- [ ] **Step 3: Implement the immutable reducer state**

```ts
export type GameState = {
  board: Board; hintMode: HintMode; availableIds: string[]; foundIds: string[];
  guesses: GuessEvent[]; strikes: number; numberOneCallUsed: boolean; numberOneBonus: boolean;
  hintUsed: boolean; startedAtMs: number;
};

export function submitGuess(state: GameState, candidateId: string, calledNumberOne: boolean): GameState {
  if (!state.availableIds.includes(candidateId)) throw new Error("Candidate is unavailable");
  if (calledNumberOne && state.numberOneCallUsed) throw new Error("Number-one call already used");
  const correct = state.board.ranked.includes(candidateId);
  return {
    ...state,
    availableIds: state.availableIds.filter((id) => id !== candidateId),
    foundIds: correct ? [...state.foundIds, candidateId] : state.foundIds,
    strikes: state.strikes + (correct ? 0 : 1),
    numberOneCallUsed: state.numberOneCallUsed || calledNumberOne,
    numberOneBonus: state.numberOneBonus || (calledNumberOne && candidateId === state.board.ranked[0]),
    guesses: [...state.guesses, { candidateId, calledNumberOne, atMs: Date.now() - state.startedAtMs }]
  };
}
```

- [ ] **Step 4: Write failing search and hint tests**

```ts
it("finds aliases but returns canonical candidates", () => {
  const state = createGame(validCitiesBoard, "on");
  expect(searchRemaining(state, "la")[0]).toMatchObject({ label: "Los Angeles" });
});

it("permits exactly one free hint only in Hints On", () => {
  expect(useHint(createGame(validCitiesBoard, "on")).hintUsed).toBe(true);
  expect(() => useHint(useHint(createGame(validCitiesBoard, "on")))).toThrow(/used/i);
  expect(() => useHint(createGame(validCitiesBoard, "off"))).toThrow(/off/i);
});
```

- [ ] **Step 5: Implement normalized alias search and one-hint rule**

```ts
const normalize = (value: string) => value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function searchRemaining(state: GameState, query: string) {
  const needle = normalize(query);
  if (needle.length < 1) return [];
  return state.board.universe.filter((candidate) => state.availableIds.includes(candidate.id) && [candidate.label, ...candidate.aliases].some((value) => normalize(value).includes(needle)));
}
export function useHint(state: GameState): GameState {
  if (state.hintMode === "off") throw new Error("Hints are off");
  if (state.hintUsed) throw new Error("Free hint already used");
  return { ...state, hintUsed: true };
}
```

For the single free hint, the player chooses **First letter** or **Metric value**. The engine then chooses one unguessed Top 10 rank using a seeded deterministic selector from the play ID and returns only the selected reveal. The board contract must therefore include `metricValue` on each ranked candidate. `deriveResult` returns `{ answersFound, score: min(11, answersFound + numberOneBonus), strikes, completed: answersFound === 10 || strikes === 5 }` and rejects further transitions once completed.

- [ ] **Step 6: Run package tests and commit**

Run: `pnpm vitest packages/game/src --run`

Expected: PASS for engine, search, score, and hint tests.

```bash
git add packages/game
git commit -m "feat: implement deterministic top ten engine"
```

## Task 3: Authoritative Date, Play, Ranking, and Streak API

**Files:**
- Create: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/migrations/0001_initial.sql`
- Create: `apps/api/src/date-policy.ts`
- Create: `apps/api/src/plays.ts`
- Create: `apps/api/src/rankings.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/plays.test.ts`
- Create: `packages/game/src/streaks.ts`
- Create: `packages/game/src/streaks.test.ts`

**Interfaces:**
- Consumes: shared play contracts and `deriveResult`.
- Produces: `POST /v1/plays/start`, `POST /v1/plays/:id/finish`, `GET /v1/rankings/:gameDay`, `verifySubmission(play, submission, board, receivedAt)`, and `applyDailyResult(streaks, result, gameDay)`.

- [ ] **Step 1: Define Drizzle tables with uniqueness constraints**

```ts
export const plays = pgTable("plays", {
  id: uuid("id").primaryKey(), playerId: uuid("player_id").notNull(), boardId: text("board_id").notNull(),
  boardVersion: integer("board_version").notNull(), gameDay: date("game_day").notNull(), mode: text("mode").notNull(),
  hintMode: text("hint_mode").notNull(), startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }), score: integer("score"), elapsedMs: integer("elapsed_ms")
}, (table) => [uniqueIndex("one_daily_per_player_day").on(table.playerId, table.gameDay, table.mode)]);
```

Also define `players`, `sessions`, `boards`, `boardVersions`, `scheduleAssignments`, `streaks`, `achievementUnlocks`, and `auditEvents`. An Archive play stores `boardGameDay` separately from `playedAt`; Archive uniqueness is `(playerId, boardId, boardVersion)`, so multiple different Archive boards may be played on the same calendar day. Generate and commit the SQL migration with `pnpm --filter @daily/api drizzle-kit generate`; verify an empty database with `pnpm --filter @daily/api drizzle-kit migrate`.

- [ ] **Step 2: Write failing API tests for time and idempotency**

```ts
it("returns the same Daily play when start is retried", async () => {
  const first = await startDaily(player, "off", now);
  const second = await startDaily(player, "off", now);
  expect(second.playId).toBe(first.playId);
});

it("rejects a canonical day before the player's latest day", async () => {
  await setLatestGameDay(player.id, "2026-07-11");
  await expect(startDaily(player, "off", new Date("2026-07-10T12:00:00Z"))).rejects.toThrow(/time check/i);
});
```

- [ ] **Step 3: Implement server-day and play transaction services**

```ts
export function canonicalGameDay(now: Date, zone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export async function finishPlay(playId: string, submission: PlayResult) {
  return db.transaction(async (tx) => {
    const play = await lockPlay(tx, playId);
    if (play.finishedAt) return play;
    const board = await loadImmutableBoard(tx, play.boardId, play.boardVersion);
    const result = verifySubmission(play, submission, board, new Date());
    return persistResultAndStreaks(tx, play, result);
  });
}
```

- [ ] **Step 4: Specify and test authoritative submission replay**

```ts
it("recomputes score and elapsed time instead of trusting the client", () => {
  const verified = verifySubmission(startedPlay, forgedSubmission, validCitiesBoard, new Date("2026-07-11T12:01:00Z"));
  expect(verified.score).toBe(deriveResult(replay(validCitiesBoard, forgedSubmission.guesses)).score);
  expect(verified.elapsedMs).toBe(60_000);
});

it("rejects non-monotonic timestamps and impossible event counts", () => {
  expect(() => verifySubmission(startedPlay, submissionWithTimes([2000, 1000]), validCitiesBoard, receivedAt)).toThrow(/monotonic/i);
  expect(() => verifySubmission(startedPlay, submissionWithGuessCount(validCitiesBoard.universe.length + 1), validCitiesBoard, receivedAt)).toThrow(/guess count/i);
});
```

`verifySubmission` ignores client-computed score, strike, completion, and elapsed values. It replays canonical IDs against the immutable board version and rejects unavailable or duplicate IDs, reuse of the #1 call, guesses after completion, negative/non-monotonic `atMs`, and arrays longer than the issued universe. Ranking elapsed time is `finishRequestReceivedAt - serverStartedAt`. Flag a configurable impossible-time threshold (initially ten correct submissions in under five seconds) for ranking exclusion and audit rather than deleting the play. The ranking day is always the server-issued start day, including a play begun before midnight and finished afterward.

- [ ] **Step 5: Write and implement ranking/streak tests**

```ts
expect(sortRankings([
  { score: 10, elapsedMs: 20_000, acceptedAt: 3 },
  { score: 11, elapsedMs: 40_000, acceptedAt: 2 },
  { score: 10, elapsedMs: 10_000, acceptedAt: 1 }
]).map((r) => r.score)).toEqual([11, 10, 10]);

expect(applyDailyResult(emptyStreaks, { score: 5, answersFound: 5, hintMode: "off" }, "2026-07-11").fivePlus.current).toBe(1);
expect(applyDailyResult(emptyStreaks, { score: 10, answersFound: 10, hintMode: "off" }, "archive").played.current).toBe(0);
```

- [ ] **Step 6: Add API boundary hardening tests and middleware**

Parse every path, query, cookie, and JSON body with Zod. Cap request bodies at 64 KiB, guess arrays at the issued universe size, IDs at 128 characters, and ranking page sizes at 100. Allow CORS only from configured first-party origins. Send a restrictive Content Security Policy, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and production HSTS. Apply per-IP and per-player token-bucket limits to play start/finish, session creation, and ranking reads; return `429` with `Retry-After`.

- [ ] **Step 7: Run API integration tests with PostgreSQL**

Run: `docker compose up -d postgres && pnpm --filter @daily/api test`

Expected: PASS for migrations, canonical date, midnight rollover, rollback, retry, authoritative replay, anomaly exclusion, input limits, rate limits, finish, ranking, separate hint pools, and all four streaks.

- [ ] **Step 8: Commit the authoritative service**

```bash
git add apps/api packages/game/src/streaks*
git commit -m "feat: add authoritative plays rankings and streaks"
```

## Task 4: Compact Soft Depth Player PWA

**Files:**
- Create: `apps/web/src/app.tsx`
- Create: `apps/web/src/game/GameScreen.tsx`
- Create: `apps/web/src/game/SearchPicker.tsx`
- Create: `apps/web/src/game/useGame.ts`
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/game.css`
- Create: `apps/web/src/game/GameScreen.test.tsx`
- Create: `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: game package functions and API play contracts.
- Produces: installable `/today` player experience with persisted active state.

- [ ] **Step 1: Write failing UI test for the critical counter and grid**

```tsx
render(<GameScreen board={validCitiesBoard} start={playStart} />);
expect(screen.getByText("0 / 10")).toBeVisible();
expect(screen.getAllByTestId("rank-slot")).toHaveLength(10);
expect(screen.queryByText("0 / 11")).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the UI test and verify failure**

Run: `pnpm --filter @daily/web test -- GameScreen.test.tsx`

Expected: FAIL because `GameScreen` does not exist.

- [ ] **Step 3: Implement the compact semantic board**

```tsx
export function GameScreen({ board, start }: Props) {
  const game = useGame(board, start);
  return <main class="game-shell">
    <header><span>DAILY · {board.tags[0].toUpperCase()}</span><time>{game.elapsed}</time></header>
    <h1>{board.title}</h1><p>{board.metric}</p>
    <div class="status"><strong>{game.state.foundIds.length} / 10</strong><StrikeMeter strikes={game.state.strikes} /></div>
    <ol class="rank-grid">{board.ranked.map((id, rank) => <li data-testid="rank-slot"><b>{rank + 1}</b><span>{game.state.foundIds.includes(id) ? board.universe.find((c) => c.id === id)?.label : "?"}</span></li>)}</ol>
    <SearchPicker state={game.state} onSelect={game.submitSelected} armed={game.callNumberOne} />
    {!game.state.numberOneCallUsed && <button aria-pressed={game.callNumberOne} onClick={game.toggleCall}>⓵ {game.callNumberOne ? "Submit next as #1 (+1)" : "Call #1 (+1)"}</button>}
    {game.state.hintMode === "on" && !game.state.hintUsed && <button onClick={game.useHint}>Reveal one rank's first letter or value (free · 1×)</button>}
  </main>;
}
```

- [ ] **Step 4: Implement the exact Soft Depth constraints**

```css
:root { color-scheme: light dark; --bg:#eef1f6; --surface:#fff; --ink:#191a1d; --muted:#6f7580; --radius:14px; }
.game-shell { min-height:100dvh; max-width:390px; margin:auto; padding:16px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--ink); }
.rank-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:8px; border-radius:16px; background:color-mix(in srgb,var(--surface) 84%,transparent); box-shadow:0 10px 28px #33415510; }
.rank-grid li { display:flex; justify-content:space-between; min-height:36px; align-items:center; padding:0 8px; border-radius:9px; background:color-mix(in srgb,var(--surface) 65%,#dfe3ea); }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.01ms!important; transition-duration:.01ms!important; } }
```

- [ ] **Step 5: Configure PWA caching and active-game persistence**

Configure `vite-plugin-pwa` to precache the shell and use stale-while-revalidate for board GET requests. Persist `GameState` by `playId` in IndexedDB after every reducer transition; restore it without changing `startedAt`.

Tapping a canonical search suggestion submits it immediately; there is no redundant Submit button. The one-time #1 control is an explicit armed toggle whose accent state also appears on suggestion rows. Correct answers briefly scale/fade into their ranked slot, wrong answers fill an always-visible strike pip, and reduced-motion users receive an immediate state change. Keep the live timer small and muted. First run shows one line: “Find the top 10. Five wrong guesses ends it.”

When a finished play cannot reach the API, enqueue its immutable `PlayResult` in IndexedDB and retry on `online`, app launch, and service-worker background sync when supported. Reuse the same `playId`; never create a replacement start.

- [ ] **Step 6: Verify unit tests, 390 × 700 layout, and production size**

Run: `pnpm --filter @daily/web test && pnpm --filter @daily/web build`

Expected: tests PASS; build succeeds; all ten rank slots and controls fit without document scrolling at 390 × 700 before the search picker opens. Rank slots are informational, not interactive, so their 36px rows do not violate the 44px minimum applied to buttons, suggestion rows, and other touch targets.

- [ ] **Step 7: Commit the player shell**

```bash
git add apps/web
git commit -m "feat: build compact Soft Depth daily board"
```

## Task 5: Results, Archive, Sharing, and Optional Identity

**Files:**
- Create: `apps/web/src/results/Results.tsx`
- Create: `apps/web/src/results/share.ts`
- Create: `apps/web/src/archive/Archive.tsx`
- Create: `apps/web/src/account/SignIn.tsx`
- Create: `apps/api/src/auth.ts`
- Create: `apps/api/src/archive.ts`
- Create: `packages/game/src/achievements.ts`
- Create: `packages/game/src/achievements.test.ts`
- Create: `apps/web/src/results/Results.test.tsx`
- Create: `apps/api/src/auth.test.ts`

**Interfaces:**
- Produces: `GET /v1/archive`, `GET /v1/archive/:gameDay`, `POST /v1/auth/merge-guest`, `buildShareText(result)`, and `evaluateAchievements(history, result)`.

Account authentication uses email magic links for the MVP. `POST /v1/auth/magic-link` always returns the same response, rate-limits by IP and normalized email, stores only a SHA-256 hash of a 256-bit single-use token with a 15-minute expiry, and sends the raw token through the configured transactional-email adapter. The callback consumes the token transactionally and issues a rotated opaque account session cookie with `HttpOnly; Secure; SameSite=Lax; Path=/`.

- [ ] **Step 1: Write failing result/share assertions**

```ts
expect(buildShareText({ score: 11, answersFound: 10, hintMode: "on", hintUsed: false, strikes: 0, elapsedMs: 42_000 }))
  .toContain("11 points · 10/10 · Hints On—Unused");
```

- [ ] **Step 2: Implement result copy and Web Share fallback**

Use `navigator.share()` when available; otherwise copy the same text to the clipboard. Never include answer names in shared output. Include a ten-cell emoji grid, strike marks, hint label, and an “It Goes to 11” badge only for an 11-point finish. The results view puts streaks before secondary statistics and shows the countdown to the next canonical board. Reveal missed answers into their slots sequentially, using an immediate distinct style under reduced motion.

- [ ] **Step 3: Write failing Archive exclusion and guest-merge tests**

```ts
expect(await startArchive(player, "2026-07-01")).toMatchObject({ mode: "archive" });
expect(await finishArchive(player, result)).toMatchObject({ rankingEntered: false, streaksChanged: false });
expect(await mergeGuest(account.id, guest.id)).toEqual(expect.objectContaining({ duplicateDailyResults: 0 }));
```

- [ ] **Step 4: Implement Archive review/play and append-only merge**

Return played dates with review details and missed dates as playable. Merge guest records by stable play ID and player/day uniqueness, preferring completed server records while retaining unique Archive plays and achievements.

Guest identity is a server-minted 256-bit opaque credential stored only in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie. Store only a keyed hash server-side. `merge-guest` requires both a valid signed-in account session and proof of the current guest cookie; it never accepts a guest ID from JSON. Use origin checks plus SameSite cookies for CSRF defense on state-changing routes, rotate the account session on sign-in/merge, and expire/revoke the guest credential after a successful transaction.

- [ ] **Step 5: Write and implement achievement evaluation tests**

```ts
expect(evaluateAchievements([], { score: 11, answersFound: 10, hintMode: "off", hintUsed: false, strikes: 0, elapsedMs: 42_000, mode: "daily", tags: ["geography"] }))
  .toEqual(expect.arrayContaining(["it-goes-to-11", "first-perfect-ten", "perfect-hints-off", "five-strikes-remaining"]));
expect(evaluateAchievements([], { score: 10, answersFound: 10, hintMode: "on", hintUsed: true, strikes: 1, elapsedMs: 60_000, mode: "archive", tags: ["sports"] }))
  .not.toContain("daily-perfect");
```

Define achievements as pure predicates over normalized result/history inputs. Persist unlocks with a unique `(player_id, achievement_id)` constraint so retries cannot unlock twice. Include initial definitions for It Goes to 11, First Perfect Ten, Perfect Hints Off, configurable Fast Finish thresholds, Five Strikes Remaining, theme play/perfect counts, and streak milestones.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm --filter @daily/web test && pnpm --filter @daily/api test`

Expected: PASS for result labels, no-answer sharing, Archive exclusions, and non-destructive guest merge.

```bash
git add apps/web/src/results apps/web/src/archive apps/web/src/account apps/api/src/auth* apps/api/src/archive* packages/game/src/achievements*
git commit -m "feat: add results archive sharing and account merge"
```

## Task 6: Desktop Excel-Paste Publisher and Validation

**Files:**
- Create: `apps/publisher/src/App.tsx`
- Create: `apps/publisher/src/parseClipboard.ts`
- Create: `apps/publisher/src/parseClipboard.test.ts`
- Create: `apps/api/src/publisher.ts`
- Create: `apps/api/src/publisher.test.ts`
- Create: `docs/board-import-template.csv`

**Interfaces:**
- Produces: `parseClipboard(tsv): ParsedBoard[]`, `POST /v1/publisher/import/validate`, `POST /v1/publisher/boards`, and lifecycle transitions Draft → Validated → Scheduled → Published → Retired.

All `/v1/publisher/*` routes require an account session with the `publisher` role and origin/CSRF validation. Player board/archive endpoints must reject future game days and never serialize future universes, answer validation envelopes, or schedules. Every import, edit, validation, schedule assignment/override, publish, correction, retirement, and denied mutation writes an actor/time/action audit event.

Return `404` for public future-board requests so callers cannot enumerate scheduled dates or board IDs. The public board query must include `publication_day <= canonical_server_day` in the database predicate rather than fetching and filtering in application code. Publisher reads use a separate repository interface and role-gated route tree; public serializers do not contain future-board fields.

- [ ] **Step 1: Define the Excel-compatible template**

```csv
board_id,title,metric,tags,source_name,source_url,publish_date,rank,canonical_id,label,aliases
cities-us,Top 10 U.S. cities by population,2025 estimate; city proper,geography|cities,Census,https://example.gov,,1,new-york,New York City,NYC|New York
```

Each universe candidate occupies one row. `rank` is blank for candidates outside the Top 10. Repeated board metadata must match within a board group.

- [ ] **Step 2: Write failing multi-board paste tests**

```ts
const parsed = parseClipboard(twoBoardTsv);
expect(parsed).toHaveLength(2);
expect(parsed[0].universe.length).toBeGreaterThanOrEqual(10);
expect(parsed[0].ranked).toHaveLength(10);
```

- [ ] **Step 3: Implement TSV parsing and per-board diagnostics**

Parse the header by exact column names, split tags and aliases on `|`, group by `board_id`, and return `{ validBoards, errors: [{ boardId, row, column, message }] }`. A bad group must not discard valid groups.

- [ ] **Step 4: Implement desktop preview and explicit publish action**

Render paste input, grouped preview cards, row-level diagnostics, lifecycle state, optional date editing, and disabled Publish buttons until a board passes `BoardSchema` plus date-conflict validation.

- [ ] **Step 5: Test immutable published versions**

```ts
await publish(boardV1);
await expect(updatePublished(boardV1.id, { title: "Changed" })).rejects.toThrow(/immutable/i);
expect((await correctPublished(boardV1.id, boardV2)).version).toBe(2);
```

Also test that an anonymous or ordinary player receives `403` from every publisher mutation, a future-board player request receives `404`, and a publisher action records the authenticated actor in `audit_events`.

Add a build/cache leakage test that seeds a uniquely identifiable future marker, builds the web app, primes the service worker, and recursively asserts that the marker is absent from `apps/web/dist`, generated source maps, HTML/preload responses, Cache Storage, and all unauthenticated API responses.

- [ ] **Step 6: Run publisher/API tests and commit**

Run: `pnpm --filter @daily/publisher test && pnpm --filter @daily/api test`

Expected: PASS for single/multi-board pastes, partial validity, all validation rules, lifecycle, and immutable corrections.

```bash
git add apps/publisher apps/api/src/publisher* docs/board-import-template.csv
git commit -m "feat: add desktop board import and publishing"
```

## Task 7: Random Scheduling and Emergency Board

**Files:**
- Create: `apps/api/src/scheduler.ts`
- Create: `apps/api/src/scheduler.test.ts`
- Create: `apps/api/src/jobs/schedule-next-day.ts`

**Interfaces:**
- Produces: `ensureNextBoard(gameDay, random): ScheduleResult` and an idempotent daily job entrypoint.

- [ ] **Step 1: Write failing scheduler tests**

```ts
it("preserves an explicit assignment", async () => expect(await ensureNextBoard("2026-07-12", () => 0)).toMatchObject({ source: "explicit" }));
it("randomly assigns one unused validated board", async () => expect((await ensureNextBoard("2026-07-13", () => 0.5)).source).toBe("random"));
it("uses the emergency board when the pool is empty", async () => expect((await ensureNextBoard("2026-07-14", () => 0)).source).toBe("emergency"));
```

- [ ] **Step 2: Implement idempotent random assignment**

Within one transaction, lock the target date, return any existing assignment, select all validated unused unscheduled board IDs, choose `Math.floor(random() * ids.length)`, assign it, and append an audit event. Do not apply theme balancing.

- [ ] **Step 3: Add empty-pool alert and emergency fallback**

Write a structured `publisher_pool_empty` event before assigning the configured emergency board. The job must exit nonzero only when both the normal pool and emergency board are unavailable.

- [ ] **Step 4: Run tests and commit**

Run: `pnpm --filter @daily/api test -- scheduler`

Expected: PASS for explicit, random, retry, concurrency, empty-pool, and audit cases.

```bash
git add apps/api/src/scheduler* apps/api/src/jobs
git commit -m "feat: schedule unused boards automatically"
```

## Task 8: End-to-End Verification, Accessibility, and Deployment Readiness

**Files:**
- Create: `tests/e2e/daily.spec.ts`
- Create: `tests/e2e/archive.spec.ts`
- Create: `tests/e2e/publisher.spec.ts`
- Create: `playwright.config.ts`
- Create: `docker-compose.yml`
- Create: `.github/workflows/ci.yml`
- Create: `tests/e2e/seed.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: all prior apps and packages.
- Produces: reproducible local environment and CI quality gate.

- [ ] **Step 1: Write the complete Daily journey**

Before each suite, `tests/e2e/seed.ts` resets the dedicated test database, migrates it, inserts a fixed canonical date, publisher user, valid city board, emergency board, and known schedule, then returns guest/account storage states. The seed helper is importable only when `NODE_ENV=test`; no HTTP seed route exists in production.

```ts
test("plays an 11-point Hints Off Daily in one viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/today");
  await page.getByRole("button", { name: "Hints Off" }).click();
  await page.getByRole("button", { name: /start/i }).click();
  await expect(page.getByText("0 / 10")).toBeVisible();
  await expect(page.getByTestId("rank-slot")).toHaveCount(10);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await submitAllTenWithNumberOneCall(page);
  await expect(page.getByText("11 points")).toBeVisible();
  await expect(page.getByText("Hints Off")).toBeVisible();
});
```

- [ ] **Step 2: Add Archive, rollback, reconnect, and publisher journeys**

Cover played-date review, missed-date play without streak/ranking changes, a backward-date friendly error, offline continuation after start, multi-board clipboard validation, manual schedule override, and random scheduling.

- [ ] **Step 3: Add automated accessibility assertions**

Install `@axe-core/playwright` and assert no serious or critical violations on setup, active board, results, Archive, sign-in, and publisher preview. Verify every interactive control is keyboard reachable and has an accessible name.

- [ ] **Step 4: Add CI gates**

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm typecheck
- run: pnpm lint
- run: pnpm --filter @daily/api drizzle-kit check
- run: pnpm test
- run: pnpm build
- run: pnpm playwright test
```

- [ ] **Step 5: Run the complete release check**

Run: `pnpm typecheck && pnpm lint && pnpm --filter @daily/api drizzle-kit check && pnpm test && pnpm build && pnpm playwright test`

Expected: all commands exit 0; all ten ranks and primary controls fit at 390 × 700; no serious/critical axe violations; Daily retry is idempotent; Archive never mutates streaks; results rank by score then elapsed time.

- [ ] **Step 6: Document local operation and commit**

Document prerequisites, `pnpm install`, database startup/migration, seed/import, app startup, tests, publisher template use, scheduler invocation, and environment variables without committing secrets.

```bash
git add tests playwright.config.ts docker-compose.yml .github README.md
git commit -m "test: verify Daily Top Ten MVP end to end"
```

## Delivery Checkpoints

1. **After Task 2:** deterministic game rules are independently reviewable.
2. **After Task 4:** a complete local player board works against fixtures.
3. **After Task 5:** the consumer MVP works end to end with API persistence.
4. **After Task 7:** nontechnical content operations can sustain daily publishing.
5. **After Task 8:** the system is ready for a staging deployment and real-board content QA.
