# Plan: CSV Board Data Model

**Status:** Ready to implement
**Date:** 2026-07-11

---

## Background

The board master data has been redesigned as two CSV files:

- `docs/superpowers/gameboards/d10net_boards.csv` — one row per board (header + metadata)
- `docs/superpowers/gameboards/d10net_items.csv` — one row per candidate item (TOP10, UNIVERSE, UNIVERSE_REF)

The current code uses a single flat/denormalized format (`BoardImportRowSchema`, `parseClipboard.ts`) that repeats board metadata on every row. This plan covers adapting the code to the new format.

---

## Key Decisions

1. **`sources` → two explicit named fields.** Replace `sources: {name, url}[]` with `rankingSource` and `universeSource` as distinct named fields.

2. **`canonical_value` becomes `universe[].id`.** No slug transformation. Used as-is as the universe item ID and in `ranked[]`. `GuessEventSchema.candidateId` maps directly to `canonical_value`.

3. **`ranked[]` stays 10 elements; ties resolve by CSV row order.** Sort TOP10 rows by `rank` ascending, then insertion order within tied ranks. Result is always 10 strings. A board with ≠10 TOP10 rows is a validation error.

4. **`UNIVERSE_REF` rows are filtered out before building `universe[]`.** Their `metric_value` populates `universeSize` as a fallback if the board-level `universe_size` column is empty.

5. **No DB migration needed.** `board_versions.payload` is JSONB — new `BoardSchema` fields flow through automatically. `boards` table (`id`, `title`, `created_at`) is unchanged.

6. **`version` and `gameDay` decouple from import.** The CSVs carry neither. `version` is auto-incremented by the publisher on save. `gameDay` is assigned via the existing schedule step.

7. **`prompt` is required.** `z.string().min(1)`. No fallback to title. No existing boards in the DB so no migration concern.

---

## Step 1 — Audit (read-only, no changes)

Before touching contracts, read these files and note every usage of `board.sources`, `sources[0]`, `board.metric`, and `universe[].id`:

- `packages/game/src/` — scoring and guess validation
- `apps/web/src/` — board metadata display
- `apps/api/src/app.ts` — route that serves today's board
- `apps/api/src/publisher.ts` and `publisher-repository.ts` — confirm payload is stored/retrieved as a JSONB blob with no field-specific column logic

The `sources` rename is the riskiest change. Grep before editing.

---

## Step 2 — `packages/contracts/src/index.ts`

### `BoardSchema` — modify

Add fields:
```typescript
prompt: z.string().min(1)
rankingSource: z.object({ name: z.string(), url: z.string().url() })
universeSource: z.object({ name: z.string(), url: z.string().url() })
universeDescription: z.string().optional()
universeSize: z.number().int().positive().optional()
dataAsOf: z.string().date().optional()
universeAsOf: z.string().date().optional()
```

Remove: `sources` field.

The `superRefine` validation is unchanged — it validates `universe[]` ID uniqueness and `ranked[]` membership.

### `BoardImportRowSchema` — delete

Replace with two new schemas:

```typescript
// One row of d10net_boards.csv
BoardsCsvRowSchema: {
  boardId, title, prompt, metricDesc, themeTags,
  rankingSourceName, rankingSourceUrl,
  universeSourceName, universeSourceUrl,
  dataAsOf, universeAsOf, universeDescription, universeSize, notes
}

// One row of d10net_items.csv
ItemsCsvRowSchema: {
  boardId,
  rowType,       // enum: TOP10 | UNIVERSE | UNIVERSE_REF
  rank,          // optional int 1-10
  canonicalValue,
  aliases,       // pipe-separated string
  metricValue,
  notes
}
```

---

## Step 3 — `apps/publisher/src/parseClipboard.ts`

Replace the single `parseClipboard(tsv)` export with three functions:

### `parseBoards(tsv: string)`
- Validates header matches `BoardsCsvRowSchema` columns exactly
- Parses and coerces each row (universeSize to number, dates to string)
- Returns rows or a header mismatch error

### `parseItems(tsv: string)`
- Same pattern for items columns
- Parses `rank` as nullable int, `aliases` as pipe-split array
- Validates `rowType` is one of the three enum values

### `combine(boardRows, itemRows): ParseResult`
- Groups both sets by `boardId`
- For each board:
  - Split items into `TOP10`, `UNIVERSE`, `UNIVERSE_REF` groups
  - Build `universe[]` from `TOP10` + `UNIVERSE` rows (exclude `UNIVERSE_REF`)
  - Build `ranked[]`: sort `TOP10` by `rank` asc, then insertion order for ties → 10 `canonicalValue` strings; validation error if count ≠ 10
  - `universeSize`: from board row's `universe_size`; fallback to `UNIVERSE_REF.metric_value`
  - Assemble `Board` object and run `BoardSchema.safeParse()`
- Returns `{ validBoards, errors }` — same shape as current `ParseResult`

---

## Step 4 — `apps/publisher/src/` Publisher UI

Replace the single text area with two stacked text areas:

```
[ Boards CSV — paste rows from d10net_boards.csv ]
[ Items CSV  — paste rows from d10net_items.csv  ]
[ Import — enabled when both have content         ]
```

- Boards paste fires `parseBoards()` immediately on change (shows column errors early)
- Items paste fires `parseItems()` immediately on change
- Import button calls `combine()` and stages valid boards
- Error display unchanged — per-board errors with row numbers
- No change to the scheduling / date-picker flow

---

## Step 5 — `apps/web/src/` Display Updates

Update any component that renders `board.sources` or `board.metric`:

- `board.sources[0].name` / `board.sources[0].url` → `board.rankingSource.name` / `board.rankingSource.url`
- `board.metric` → `board.metricDesc` (rename only)
- Add display of `board.prompt` as the primary game question

---

## Step 6 — Wrong Guess Rank Reveal (new feature)

When a player makes a wrong guess, show them the actual rank of that candidate.

### Data change

Add `rank?: number` to each `universe[]` item in `BoardSchema`:

```typescript
universe: z.array(z.object({
  id: z.string(),
  label: z.string(),
  aliases: z.array(z.string()),
  metricValue: z.string().max(80).optional(),
  rank: z.number().int().min(1).max(10).optional()   // new; only set for TOP10 items
}))
```

The `combine()` function populates `rank` from the CSV `rank` column for TOP10 rows. UNIVERSE rows get no `rank`.

### Game logic (`packages/game/src/`)

Add a pure function:

```typescript
function getGuessRank(candidateId: string, board: Board): number | null
```

Returns the candidate's `rank` if it's a TOP10 item, `null` if it's universe-only. Lives in the game package so it's testable independently of the UI.

For tie display, check `board.universe.filter(u => u.rank === rank).length > 1` to determine if "tied for #N" vs "#N" is appropriate.

### UI (`apps/web/src/`)

After a wrong guess resolves, display:

- TOP10 item guessed out of order: "That was actually ranked #N" (or "tied for #N")
- Universe-only item guessed: "Not in the top 10"

This is entirely client-side — the board data (including `universe[].rank`) is already present on the client. No API or server changes needed.

### File checklist addition

| File | Change |
|---|---|
| `packages/contracts/src/index.ts` | Add `rank?: number` to `universe[]` item schema |
| `packages/game/src/` | Add `getGuessRank()` function |
| `apps/web/src/` | Display rank feedback on wrong guess |

---

## Step 7 — End-to-End Test

1. Paste a real board from the CSVs into the publisher (boards first, then items)
2. Confirm validation passes and board is staged
3. Publish and schedule for today
4. Load the game — confirm `prompt` displays and game plays correctly
5. Make a wrong guess on a TOP10 item — confirm rank feedback displays
6. Make a wrong guess on a universe-only item — confirm "Not in the top 10" displays

---

## File Checklist

| File | Change |
|---|---|
| `packages/contracts/src/index.ts` | Modify `BoardSchema`, delete `BoardImportRowSchema`, add two CSV row schemas |
| `apps/publisher/src/parseClipboard.ts` | Replace with `parseBoards`, `parseItems`, `combine` |
| `apps/publisher/src/*.tsx` | Two text areas instead of one |
| `apps/web/src/` | Update sources/metric display and wrong-guess rank feedback (audit first) |
| `packages/game/src/` | Add `getGuessRank()` function |
| `apps/api/src/publisher.ts` | Verify JSONB passthrough (likely no change) |
| `apps/api/src/publisher-repository.ts` | Verify JSONB passthrough (likely no change) |
