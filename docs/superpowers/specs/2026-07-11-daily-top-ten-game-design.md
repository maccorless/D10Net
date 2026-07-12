# Daily Top Ten Game — Product Design

## Product Summary

Build a lightweight, mobile-first daily trivia PWA based on the familiar “guess the Top 10” format. The MVP differentiates itself through an optional one-time #1 rank call, explicit hint modes, achievements, multiple streak types, a complete playable archive, and a desktop publishing workflow.

The player UI should feel simple, elegant, and precise. Its visual direction is **Soft Depth**: a cool neutral background, elevated white surfaces, restrained shadows, system typography, generous touch targets, and color used primarily for gameplay feedback.

## MVP Scope

The MVP includes:

- One mixed-trivia Daily board per canonical game day
- Closed-universe boards only
- Five strikes
- One point for each Top 10 answer found
- One optional bonus point for correctly calling the #1 answer
- A maximum result score of 11, expressed with the product line “It Goes to 11”
- Hints On and Hints Off modes
- One free hint on each Hints On board
- Guest-first play with optional accounts
- Daily rankings with elapsed time as the tiebreaker
- Achievements and streaks
- Reviewable and playable Archive
- Desktop board publishing through an Excel-compatible copy/paste template
- Random automatic scheduling from unused boards

Deferred features include themed sub-games, Double Down, live or asynchronous multiplayer, Anti-Top 10 mode, live external-data ingestion, open-universe boards, earned hint tokens, rewarded-ad hints, and additional hints on a board.

## Board Model

Each board contains:

- Stable board ID and immutable version
- Optional assigned publication date
- Category title and player-facing prompt
- Metric definition and explanatory notes
- Source names and URLs
- One or more theme tags such as geography, sports, music, science, or culture
- A closed universe of canonical answer values
- Search aliases for canonical values
- Exactly ten ranked answers drawn from that universe

Theme tags must support future filtering and themed sub-games without changing the core game engine.

## Daily Game Flow

### Setup

Before beginning, the player selects and locks one of two modes:

- **Hints Off:** no hint controls appear.
- **Hints On:** hint controls are available during play.

The mode cannot change after the board starts. The interface explains that the timer continues while the app is backgrounded or closed.

### Guessing

The player searches the remaining closed universe. Search may tolerate spelling errors to help locate a candidate, but answer judging is exact: the submitted selection always resolves to one canonical value.

After submission, that candidate is removed from the remaining universe and cannot be guessed again. Duplicate guesses are therefore impossible through the normal interface.

- A Top 10 candidate fills its correct ranked slot.
- A valid universe candidate outside the Top 10 consumes one strike.
- Closed-universe boards do not allow arbitrary unmatched text to be submitted.
- The game ends after all ten answers are found or all five strikes are consumed.

### One-Time #1 Call

Each guess can optionally include a checkbox labeled **“I think this is #1 (+1)”**.

- The checkbox may be submitted only once per board.
- If that answer is ranked #1, the player earns one bonus point.
- An incorrect call has no score or strike penalty.
- Once used, the control disappears for the remainder of the board.
- Finding #1 without using the checkbox does not award the bonus.

### Score and Statistics

Each Top 10 answer is worth one point. A successful #1 call adds one point. The maximum result score is 11.

The active board’s progress counter measures answers found and therefore displays values such as **4 / 10**, never 4 / 11. The results screen separately displays the final point score, including the optional bonus.

Elapsed time, hints selected and consumed, strikes remaining, and guess history are recorded but do not modify the point score.

## Board Interface

The active mobile board uses a compact two-column grid so all ten ranked slots fit in one ordinary mobile viewport. The same viewport should also contain:

- Compact category header and metric information
- Answer progress, displayed as `found / 10`
- Strike status
- Continuously running elapsed time
- Search field
- One-time #1 checkbox while available
- Submit action
- Quiet hint-mode label

The visual hierarchy keeps the board and search interaction dominant. Navigation, streaks, theme labels, and secondary statistics remain visually quiet.

The design uses the platform system font stack, near-black primary actions, consistent rounded corners, subtle elevation, and restrained motion. It supports dark mode, reduced motion, screen readers, keyboards, and large touch targets. It avoids custom web fonts, heavy blur, image-heavy decoration, large animation libraries, and excessive gradients.

## Hints

Hints are available only when the player selected Hints On before starting.

- Each Hints On board provides exactly one free hint.
- After that hint is consumed, no additional hints are available in the MVP.
- Earned tokens and rewarded-ad hints are reserved for a future release.

Initial hint types:

1. Reveal the first letter of one unguessed Top 10 answer.
2. Reveal the metric value of one unguessed Top 10 answer without identifying it.

Every result records both the chosen mode and actual hint count. Results and shares distinguish among **Hints Off**, **Hints On — Unused**, and **Hints On — N Used**.

## Identity and Synchronization

Guests can play immediately. Guest progress is stored locally. Optional accounts synchronize results, streaks, achievements, preferences, and Archive history across devices.

On first sign-in, local history merges into the server account without overwriting newer server records. Game results use stable play IDs and idempotent submission so reconnects, retries, and multiple devices cannot create duplicate Daily results or apply streak changes twice.

## Daily Rankings and Timer Integrity

Hints On and Hints Off use separate Daily ranking pools. Rankings sort by:

1. Point score, highest first
2. Elapsed time, fastest first
3. Earliest server-accepted finish if both remain equal

The server issues a stable play ID, canonical game day, and start time. Time continues through backgrounding, closing, reconnecting, and device sleep. The client may show optimistic completion while the server remains authoritative for ranking acceptance.

## Dates and Clock Protection

The server determines the canonical game day. Device time is presentational only. Each profile retains its latest confirmed game day and is never permitted to move backward.

A suspicious device date or backward clock change must not delete progress or accuse the player. It displays a friendly message such as:

> Your device date seems to have traveled backward. We’ve kept your progress safe, but today’s game needs a quick time check before it can open.

The Archive remains available during a time mismatch because Archive play cannot affect Daily rankings or streaks. Timezone changes and travel are reconciled against the canonical server date and the player’s saved timezone policy.

## Archive

Every prior board is available.

- Played dates open in review mode with guesses, hints, strikes, elapsed time, and results.
- Missed dates remain playable as Archive games.
- Archive games never advance or break streaks.
- Archive games never enter Daily ranking pools.
- Archive games may unlock non-streak achievements unless an achievement explicitly requires the current Daily.

## Streaks and Achievements

Initial streak families:

- **Played:** finish the current main Daily board, whether by finding all ten or using all strikes.
- **Five Plus:** score at least 5 points on the current Daily.
- **Perfect Ten:** find all ten answers on the current Daily.
- **No-Hint Perfect:** find all ten after selecting Hints Off.

Initial achievements include:

- It Goes to 11
- First Perfect Ten
- Perfect with Hints Off
- Fast Finish milestones
- Finish with Five Strikes Remaining
- Theme-specific mastery
- Played, Five Plus, and Perfect streak milestones

Unused strikes, completion time, hint behavior, and themes may drive achievements even though they do not change score.

## Static-First Architecture

The client is an installable PWA with a small cached application shell. Each board is delivered as a compact, versioned payload. An already-started board can survive a temporary connection interruption.

The backend provides:

- Canonical date and game-day resolution
- Board and Archive delivery
- Optional authentication
- Progress and result synchronization
- Daily ranking aggregation
- Board publishing, validation, and scheduling

### Future-board confidentiality

Future questions are confidential until their canonical publication day. No player-facing endpoint, HTML document, JavaScript bundle, source map, preload, service-worker cache, archive response, ranking response, or client-visible schedule may contain a future board's title, prompt, tags, universe, aliases, sources, validation representation, ranked answers, or assignment. Future-board access is restricted to authenticated publisher roles and audited. Public responses should return `404` rather than confirm that a future board or assignment exists.

Guessing must not require a network request per answer. The browser receives the searchable closed universe without a plainly labeled Top 10. A signed or obfuscated validation representation may support responsive local play in the casual MVP, with the accepted limitation that a determined technical user could inspect client data. The server remains authoritative for submitted results and future competitive modes.

## Desktop Publishing Workflow

The internal publisher is optimized for desktop rather than mobile. Editors paste one or many boards from a predefined Excel template. Clipboard parsing groups rows by board ID and displays a validation preview before saving.

The template supports:

- Board ID and title
- Prompt and metric explanation
- Theme tags
- Source names and URLs
- Optional publication date
- Ranked Top 10 positions
- Full closed universe
- Aliases

Validation identifies:

- Top 10 answers missing from the universe
- Duplicate canonical values
- Conflicting aliases
- Missing or duplicate ranks
- Any ranked-answer count other than ten
- Missing tags, sources, or metric descriptions
- Malformed or conflicting dates
- Duplicate board IDs or versions
- Payloads exceeding the agreed client-size budget

Importing many boards can report valid and invalid boards independently. Nothing is published without an explicit review step.

Board lifecycle states are **Draft**, **Validated**, **Scheduled**, **Published**, and **Retired**. Published board versions are immutable; corrections create a new version while existing results retain the version played.

## Automatic Scheduling

A daily job guarantees content for the next game day:

1. Use an explicitly assigned validated board when present.
2. Otherwise select randomly from validated, unused, unscheduled boards.
3. Assign and lock the selected board to the next date.
4. If no eligible board exists, alert an editor and use a configured emergency board rather than leaving the game unavailable.

Random scheduling does not balance or avoid repeated themes. Every automatic assignment is logged and can be changed until its publication cutoff.

## Error Handling

- **Offline before start:** offer a valid cached board or request reconnection.
- **Connection loss during play:** continue locally, preserve progress, keep the timer running, and sync afterward.
- **Clock mismatch:** permit Archive play and require a friendly time check before today’s board.
- **Failed account sync:** retain local results and retry idempotently.
- **Board corrected mid-play:** finish against the immutable version issued at start.
- **No scheduled content:** serve an emergency board and alert publishing staff.

## Verification Strategy

Deterministic game-engine tests cover exact canonical submission, alias search, candidate removal, strike handling, completion, #1 checkbox consumption, maximum score 11, answer-progress display out of 10, hints, and Archive exclusions.

Integration tests cover guest-to-account merging, idempotent result submission, ranking order, separate hint-mode pools, streak calculations, server dates, clock rollback, board import, validation, scheduling, and immutable versions.

Mobile journey tests cover setup, guessing, search above the software keyboard, all ten slots in one viewport, completion, sharing, Archive review/play, reconnecting, resuming after close, accessibility, dark mode, reduced motion, and slow connections.

Performance constraints include minimal application JavaScript, no network round trip per guess, compact board payloads, cached repeat startup, and avoidance of heavy UI or animation dependencies unless measurement justifies them.
