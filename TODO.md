# D10Net Backlog

## UI / Share

### BKL-001: Share button includes quiz title
2026-07-12 — The share card should include the board title alongside the emoji grid so recipients know what quiz was shared.

### BKL-002: End-of-game scorecard with missed guesses
2026-07-12 — After the game ends (win or 5 strikes), show a full scorecard: answers found in order, missed guesses (what was typed, what the correct position was), and final score. Currently only the score is shown.

### BKL-003: Post-guess contextual value display
2026-07-12 — After a guess is resolved (correct or wrong), if the board has a metric value for that item, display it in the feedback (e.g. the date for B076, the population count, the chart position). Boards with `metric_format=date_yyyymmdd` should render via `formatMetricValue()`. Applies to the wrong-guess feedback row and the revealed-answer row.

## Archive / History

### BKL-004: Playable archive with calendar widget
2026-07-12 — A calendar view showing every past game day. Each day cell is visually distinct for three states: (1) played on the day, (2) played later in archive mode, (3) not yet played. Tapping a played day opens the same results screen as end-of-game. Tapping an unplayed day launches that board in archive mode. Requires persisting per-day play history on device/account.

## Gamification

### BKL-005: Achievements and streaks system
2026-07-12 — Define and implement a set of achievements (e.g. first perfect score, #1 bonus used, 10-day streak) and streak counters (daily play streak, perfect-score streak). User-facing board shows all achievements with locked/unlocked state. Achievements to be fully defined before implementation begins.

### BKL-006: Ad system for hint purchasing
2026-07-12 — Integrate a rewarded-ad provider. Watching a short ad grants one hint. Intended as the primary monetization path. Needs ad SDK selection, platform entitlements (iOS/Android), and a consent/GDPR flow.

### BKL-007: Hint inventory
2026-07-12 — Hints accumulate in a persistent inventory rather than being single-use per day. Inventory is replenished by: watching rewarded ads (BKL-006), completing achievements/streaks (BKL-005), and the default daily free hint. UI needs an inventory counter visible before and during play.
