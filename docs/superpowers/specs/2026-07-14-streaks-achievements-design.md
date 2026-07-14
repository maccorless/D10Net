Created: 14-Jul-2026 10:00 EDT

# Streaks and Achievements — Product Design

## Summary

A single primary streak (consecutive days played) drives daily return. All other performance milestones become achievements with Bronze/Silver/Gold tiers. Achievements are stored locally (guest-first, migration-ready) and surfaced via toast on the results screen and a browsable badge wall.

---

## Streak

**One primary streak: consecutive days played.**

- Increments when a player completes the current Daily board (win or lose).
- Breaks hard if a calendar day is skipped. No freeze, no grace period.
- Archive plays never increment or protect the streak.
- Displayed prominently on the results screen and stats page.

**Streak milestone achievements** (one-time unlocks, not tiered):

| Milestone | Days |
|---|---|
| First Week | 7 |
| Month | 30 |
| Century | 100 |
| Year | 365 |

---

## Achievements

All tiered achievements use Bronze / Silver / Gold. Tier thresholds vary by type.

### Score Precision (lifetime count: 1x / 10x / 100x)

| Badge | Description | Bronze | Silver | Gold |
|---|---|---|---|---|
| It Goes to 11 | Score 11 on a Daily board | 1st | 10th | 100th |
| Perfect Ten | Find all 10 answers | 1st | 10th | 100th |
| Full Deck | Finish with all 5 strikes remaining | 1st | 10th | 100th |
| Purist | Perfect Ten with Hints Off | 1st | 10th | 100th |

### The #1 Call

| Badge | Description | Bronze | Silver | Gold |
|---|---|---|---|---|
| Called It | Correctly call #1 | 1st | 10th | 100th |
| Oracle | Consecutive correct #1 calls (resets on any incorrect call or any board where the #1 call is not used) | 3 | 5 | 10 |

### Cumulative Score Windows (rolling, any qualifying window ever)

| Badge | Bronze | Silver | Gold |
|---|---|---|---|
| Week Score | 50 pts in 7 days | 70 pts in 7 days | 77 pts in 7 days |
| Month Score | 100 pts in 30 days | 200 pts in 30 days | 300 pts in 30 days |

Note: 77 is the maximum possible weekly score (11 pts/day × 7 days). 300 is near-maximum monthly.

### Speed (lifetime count: 1x / 10x / 100x, qualifying time threshold)

| Badge | Bronze | Silver | Gold |
|---|---|---|---|
| Fast Finish | Complete a Daily board in under 2 min (archive boards excluded) | Under 1 min | Under 30 sec |

### Comeback (one-time unlock)

| Badge | Condition |
|---|---|
| Phoenix | Complete a Daily board after breaking a streak of 30 or more days |

---

## Data Model (Local Storage, Migration-Ready)

Each achievement is stored as a record with stable string IDs. Server merge is a straight upsert by ID.

```ts
interface AchievementRecord {
  achievementId: string;       // e.g. "perfect-ten", "oracle", "week-score"
  tier: 0 | 1 | 2 | 3;        // 0 = locked, 1 = Bronze, 2 = Silver, 3 = Gold
  count: number;               // lifetime qualifying event count
  bestValue?: number;          // for Oracle (streak length), Fast Finish (seconds)
  unlockedAt: string[];        // ISO timestamp per tier earned (index 0 = Bronze, etc.)
}
```

Achievement IDs:
- `it-goes-to-11`, `perfect-ten`, `full-deck`, `purist`
- `called-it`, `oracle`
- `week-score`, `month-score`
- `fast-finish`
- `streak-7`, `streak-30`, `streak-100`, `streak-365` (one-time, tier always = 3 when unlocked)
- `phoenix`

Rolling window evaluation (week-score, month-score) runs on Daily result submission. The client maintains a rolling array of Daily scores with timestamps and evaluates whether any 7-day or 30-day window clears a new tier threshold.

When a registered account syncs, local achievement records merge into the server profile via idempotent upsert: server wins on tier, count, and bestValue if server values are higher; unlockedAt arrays merge and deduplicate.

---

## UX and Display

### Toast (Results Screen)

- Achievements earned during a play session surface as toasts after the results screen renders — never mid-game.
- If multiple achievements unlock in one session, queue them sequentially.
- Each toast shows: badge name, tier earned, one-line description.
- Auto-dismisses after ~4 seconds; tappable to dismiss early.

### Badge Wall

- Accessible via nav (placement and visual design deferred to frontend-design skill).
- Achievements grouped by category: Streak Milestones, Score Precision, The #1 Call, Score Windows, Speed, Comeback.
- Each badge shows current tier (Bronze/Silver/Gold) or locked state.
- Tiered badges show progress toward next tier (e.g. "7 / 10 Perfect Tens").
- Streak milestones display as a linear timeline (7 → 30 → 100 → 365), earned entries lit up.

**Frontend design:** Badge wall layout, toast animation, badge iconography, and nav placement are handled via the `frontend-design` skill during implementation planning.

---

## Deferred

- Theme mastery badges (Geography, Sports, Music, Science, Culture) — deferred until theme filtering ships.
- Streak freeze / shield mechanic — explicitly excluded; hard break is intentional.
- Achievement points or XP system — YAGNI.
- Social sharing of specific achievements — evaluate after badge wall ships.
