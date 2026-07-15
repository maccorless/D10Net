# D10Net Backlog

## Gamification

### BKL-PLAN: Brainstorm achievements and streaks definitions
2026-07-12 — Before implementing BKL-005/006/007 (gamification cluster), run a brainstorm session to define the full achievement list, streak milestones, and hint-inventory rules. Use `/brainstorm` or `superpowers:brainstorming`. Output: a spec doc that BKL-005/006/007 planning depends on. Block: BKL-005, BKL-006, BKL-007.

### BKL-005: Achievements and streaks system
2026-07-12 — Define and implement a set of achievements (e.g. first perfect score, #1 bonus used, 10-day streak) and streak counters (daily play streak, perfect-score streak). User-facing board shows all achievements with locked/unlocked state. Achievements to be fully defined before implementation begins.

### BKL-006: Ad system for hint purchasing
2026-07-12 — Integrate a rewarded-ad provider. Watching a short ad grants one hint. Intended as the primary monetization path. Needs ad SDK selection, platform entitlements (iOS/Android), and a consent/GDPR flow.

### BKL-007: Hint inventory
2026-07-12 — Hints accumulate in a persistent inventory rather than being single-use per day. Inventory is replenished by: watching rewarded ads (BKL-006), completing achievements/streaks (BKL-005), and the default daily free hint. UI needs an inventory counter visible before and during play.
