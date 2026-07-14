Created: 14-Jul-2026 10:00 EDT

# Streaks and Achievements — Product Design

## Summary

A single primary streak (consecutive days played) drives daily return. All other performance milestones are achievements with Bronze/Silver/Gold tiers. Achievements are stored locally (guest-first, migration-ready) and surfaced via toast on the results screen and a browsable badge wall.

---

## Streak

**One primary streak: consecutive days played.**

- Increments when a player completes the current Daily board (win or lose).
- Breaks hard if a calendar day is skipped. No freeze, no grace period.
- Archive plays never increment or protect the streak.
- Displayed prominently on the results screen and stats page.

**Streak milestone achievements** (one-time unlocks, not tiered):

| ID | Display label | Condition |
|---|---|---|
| `streak-7` | First Week | Consecutive days streak reaches 7 |
| `streak-30` | Month | Consecutive days streak reaches 30 |
| `streak-100` | Century | Consecutive days streak reaches 100 |
| `streak-365` | Year | Consecutive days streak reaches 365 |

Streak milestones are Daily-only. Archive plays do not contribute.

---

## Achievements

All tiered achievements use Bronze / Silver / Gold. Tiers are permanent — earning Gold does not remove Bronze.

### Score Precision (lifetime count: 1x / 10x / 100x)

Daily or Archive boards qualify unless noted.

| ID | Display label | Condition | Bronze | Silver | Gold |
|---|---|---|---|---|---|
| `it-goes-to-11` | It Goes to 11 | `score === 11` on a completed play | 1st | 10th | 100th |
| `perfect-ten` | Perfect Ten | All 10 answers found | 1st | 10th | 100th |
| `full-deck` | Full Deck | All 10 found with `strikesUsed === 0` | 1st | 10th | 100th |
| `purist` | Purist | All 10 found with `hintMode === "off"` | 1st | 10th | 100th |

Note: `it-goes-to-11` evaluates `score === 11` against the result, not internal bonus mechanics. `full-deck` uses `strikesUsed === 0`, which equals "5 strikes remaining" in player-facing copy.

### The #1 Call

Daily or Archive boards qualify.

| ID | Display label | Condition | Bronze | Silver | Gold |
|---|---|---|---|---|---|
| `called-it` | Called It | Correct #1 call on a completed play | 1st | 10th | 100th |
| `oracle` | Oracle | Consecutive boards with a correct #1 call (resets on any incorrect call or any board where the #1 call is not used) | 3 | 5 | 10 |

### Cumulative Score Windows (rolling, Daily boards only)

Tier upgrades when any rolling window ever clears the threshold. Archive plays do not count — a player could replay many archive boards in one day and hit 77 points without the sustained daily performance the window is designed to measure.

| ID | Display label | Bronze | Silver | Gold |
|---|---|---|---|---|
| `week-score` | Week Score | 50 pts in any rolling 7-day window | 70 pts | 77 pts |
| `month-score` | Month Score | 100 pts in any rolling 30-day window | 200 pts | 300 pts |

Note: 77 is the maximum possible weekly score (11 pts × 7 days). 300 is near-maximum monthly (11 × 30 = 330).

### Speed (lifetime count: 1x / 10x / 100x)

Daily boards only. Requires all 10 answers found (perfect completion). Archive boards and non-perfect completions do not qualify.

| ID | Display label | Bronze | Silver | Gold |
|---|---|---|---|---|
| `fast-finish` | Fast Finish | All 10 found in under 2 min | Under 1 min | Under 30 sec |

### Comeback (one-time unlock)

| ID | Display label | Condition |
|---|---|---|
| `phoenix` | Phoenix | Complete a Daily board after breaking a streak of 30 or more days |

---

## Evaluation Contract

Achievement evaluation takes a normalized result record and the player's existing achievement state. It returns zero or more new unlock events. Evaluation is deterministic and idempotent — replaying the same `playId` produces no new unlocks.

```ts
type AchievementResult = {
  playId: string;
  mode: "daily" | "archive";
  gameDay: string;
  boardId: string;
  boardVersion: number;
  score: number;
  answersFound: number;
  hintMode: "on" | "off";
  hintUsed: boolean;
  strikesUsed: number;
  elapsedMs: number;
  completed: boolean;
  tags: string[];        // reserved for future theme achievements
};

type AchievementUnlock = {
  achievementId: string;
  tier: 1 | 2 | 3;      // 1 = Bronze, 2 = Silver, 3 = Gold
  unlockedAt: string;    // ISO timestamp
  playId: string;        // source play for audit
};
```

### Configuration

Thresholds are configuration, not hard-coded:

```ts
const achievementConfig = {
  fastFinishMs: [120_000, 60_000, 30_000],   // Bronze, Silver, Gold
  weekScorePts: [50, 70, 77],
  monthScorePts: [100, 200, 300],
  streakMilestones: [7, 30, 100, 365],
  oracleConsecutive: [3, 5, 10],
  lifetimeCountTiers: [1, 10, 100],
};
```

---

## Data Model (Local Storage, Migration-Ready)

Each achievement stored with a stable string ID. Server merge is a straight upsert by ID — server wins on tier, count, and bestValue if server values are higher.

```ts
interface AchievementRecord {
  achievementId: string;
  tier: 0 | 1 | 2 | 3;       // 0 = locked, 1–3 = Bronze/Silver/Gold
  count: number;              // lifetime qualifying event count
  bestValue?: number;         // Oracle: current consecutive count; Fast Finish: best elapsedMs
  unlockedAt: string[];       // ISO timestamp per tier earned (index 0 = Bronze)
  evaluatedPlayIds: string[]; // idempotency: play IDs already evaluated
}
```

Rolling window evaluation (week-score, month-score) runs on Daily result submission. The client maintains a rolling array of `{ gameDay, score }` entries for the last 30 days and evaluates window sums on each new result.

When a registered account syncs, local records merge into the server profile: server wins on tier, count, bestValue; `unlockedAt` arrays merge and deduplicate; `evaluatedPlayIds` union to prevent re-evaluation on either side.

---

## Acceptance Tests

The achievement evaluator must have deterministic tests for:

- `it-goes-to-11` unlocks on `score === 11` and is idempotent on replayed `playId`.
- `full-deck` unlocks only when `strikesUsed === 0`.
- Archive play unlocks `perfect-ten`, `it-goes-to-11`, `full-deck`, `purist`, `called-it`, `oracle` but never streak milestones, `fast-finish`, `week-score`, `month-score`, or `phoenix`.
- `fast-finish` requires `mode === "daily"` and `answersFound === 10`.
- `oracle` consecutive count resets when `called-it` is not used or is incorrect.
- Rolling window correctly identifies a qualifying 7-day and 30-day span.
- Guest-to-account merge preserves existing unlocks and does not duplicate.
- Replayed result submission (same `playId`) produces no new unlock events.

---

## UX and Display

### Toast (Results Screen)

- Toasts surface after the results screen renders, never mid-game.
- Multiple unlocks in one session queue sequentially.
- Each toast shows: badge name, tier earned, one-line description.
- Auto-dismisses after ~4 seconds; tappable to dismiss early.

### Badge Wall

- Accessible via nav (placement and visual design deferred to frontend-design skill).
- Grouped by category: Streak Milestones, Score Precision, The #1 Call, Score Windows, Speed, Comeback.
- Each badge shows current tier or locked state.
- Tiered badges show progress toward next tier (e.g. "7 / 10 Perfect Tens").
- Streak milestones display as a linear timeline (7 → 30 → 100 → 365), earned entries lit up.

**Frontend design:** Badge wall layout, toast animation, badge iconography, and nav placement are handled via the `frontend-design` skill during implementation planning.

---

## Deferred

- Theme mastery badges (Geography, Sports, Music, Science, Culture) — deferred until theme filtering ships. IDs reserved as `theme-{tag}-play-{n}`.
- Streak freeze / shield mechanic — explicitly excluded; hard break is intentional.
- Achievement points or XP system — YAGNI.
- Social sharing of specific achievements — evaluate after badge wall ships.
