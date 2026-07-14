import { describe, expect, it } from "vitest";
import {
  type AchievementResult,
  defaultAchievementConfig,
  evaluateAchievements,
} from "./achievements";

function makeResult(
  overrides: Partial<AchievementResult> = {},
): AchievementResult {
  return {
    playId: "play-1",
    mode: "daily",
    gameDay: "2026-07-14",
    boardId: "board-1",
    boardVersion: 1,
    score: 10,
    answersFound: 10,
    hintMode: "on",
    hintUsed: false,
    strikesUsed: 2,
    elapsedMs: 180_000,
    completed: true,
    tags: [],
    ...overrides,
  };
}

function makeExisting(
  overrides: Partial<{
    counts: Record<string, number>;
    earnedTiers: Record<string, number>;
    oracleStreak: number;
    evaluatedPlayIds: string[];
    playedStreak: number;
    bestPlayedStreak: number;
    weekBestScore: number;
    monthBestScore: number;
  }> = {},
) {
  return {
    counts: {},
    earnedTiers: {},
    oracleStreak: 0,
    evaluatedPlayIds: [],
    playedStreak: 1,
    bestPlayedStreak: 1,
    weekBestScore: 0,
    monthBestScore: 0,
    ...overrides,
  };
}

const NOW = "2026-07-14T12:00:00.000Z";

describe("evaluateAchievements", () => {
  // 1. it-goes-to-11 unlocks on score===11 and is idempotent on replayed playId
  it("unlocks it-goes-to-11 when score===11 and completed", () => {
    const result = makeResult({ score: 11, completed: true });
    const unlocks = evaluateAchievements(
      result,
      makeExisting(),
      defaultAchievementConfig,
      NOW,
    );
    expect(
      unlocks.some((u) => u.achievementId === "it-goes-to-11" && u.tier === 1),
    ).toBe(true);
  });

  it("is idempotent — replayed playId returns []", () => {
    const result = makeResult({ score: 11, playId: "play-abc" });
    const existing = makeExisting({ evaluatedPlayIds: ["play-abc"] });
    expect(
      evaluateAchievements(result, existing, defaultAchievementConfig, NOW),
    ).toEqual([]);
  });

  // 2. full-deck unlocks only when strikesUsed===0
  it("unlocks full-deck only when strikesUsed===0", () => {
    const withStrikes = makeResult({ strikesUsed: 1, answersFound: 10 });
    const noStrikes = makeResult({ strikesUsed: 0, answersFound: 10 });

    const hasFullDeck = (r: AchievementResult) =>
      evaluateAchievements(
        r,
        makeExisting(),
        defaultAchievementConfig,
        NOW,
      ).some((u) => u.achievementId === "full-deck");

    expect(hasFullDeck(withStrikes)).toBe(false);
    expect(hasFullDeck(noStrikes)).toBe(true);
  });

  // 3. Archive play unlocks count/oracle achievements but NOT daily-only ones
  it("archive play unlocks count achievements and oracle but not daily-only ones", () => {
    const result = makeResult({
      mode: "archive",
      score: 11,
      answersFound: 10,
      strikesUsed: 0,
      hintMode: "off",
      completed: true,
    });
    const existing = makeExisting({ oracleStreak: 2 }); // 2+1=3 triggers oracle tier 1
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    const ids = unlocks.map((u) => u.achievementId);

    // Should unlock
    expect(ids).toContain("it-goes-to-11");
    expect(ids).toContain("perfect-ten");
    expect(ids).toContain("full-deck");
    expect(ids).toContain("purist");
    expect(ids).toContain("called-it");
    expect(ids).toContain("oracle");

    // Must NOT unlock daily-only
    expect(ids).not.toContain("streak-7");
    expect(ids).not.toContain("fast-finish");
    expect(ids).not.toContain("week-score");
    expect(ids).not.toContain("month-score");
    expect(ids).not.toContain("phoenix");
  });

  // 4. fast-finish requires mode==="daily" and answersFound===10
  it("fast-finish does not unlock for archive mode", () => {
    const result = makeResult({
      mode: "archive",
      answersFound: 10,
      elapsedMs: 1_000,
    });
    const ids = evaluateAchievements(
      result,
      makeExisting(),
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).not.toContain("fast-finish");
  });

  it("fast-finish does not unlock when answersFound < 10 (daily)", () => {
    const result = makeResult({
      mode: "daily",
      answersFound: 9,
      elapsedMs: 1_000,
    });
    const ids = evaluateAchievements(
      result,
      makeExisting(),
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).not.toContain("fast-finish");
  });

  it("fast-finish tier 1 unlocks at elapsedMs < 120_000 (daily, answersFound===10)", () => {
    const result = makeResult({
      mode: "daily",
      answersFound: 10,
      elapsedMs: 90_000,
    });
    const unlocks = evaluateAchievements(
      result,
      makeExisting(),
      defaultAchievementConfig,
      NOW,
    );
    expect(
      unlocks.some((u) => u.achievementId === "fast-finish" && u.tier === 1),
    ).toBe(true);
    expect(
      unlocks.some((u) => u.achievementId === "fast-finish" && u.tier === 2),
    ).toBe(false);
  });

  it("fast-finish tiers 1+2+3 all unlock at elapsedMs < 30_000", () => {
    const result = makeResult({
      mode: "daily",
      answersFound: 10,
      elapsedMs: 10_000,
    });
    const unlocks = evaluateAchievements(
      result,
      makeExisting(),
      defaultAchievementConfig,
      NOW,
    );
    expect(
      unlocks
        .filter((u) => u.achievementId === "fast-finish")
        .map((u) => u.tier)
        .sort(),
    ).toEqual([1, 2, 3]);
  });

  // 5. oracle consecutive resets when score === answersFound (no called-it)
  it("oracle does not unlock when score === answersFound (no called-it)", () => {
    // oracleStreak=2, but this play has score===answersFound so streak resets to 0
    const result = makeResult({ score: 10, answersFound: 10, completed: true });
    const existing = makeExisting({ oracleStreak: 2 });
    const ids = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).not.toContain("oracle");
  });

  it("oracle tier 1 unlocks after 3 consecutive called-it plays", () => {
    const result = makeResult({ score: 11, answersFound: 10, completed: true });
    const existing = makeExisting({ oracleStreak: 2 }); // 2+1=3
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    expect(
      unlocks.some((u) => u.achievementId === "oracle" && u.tier === 1),
    ).toBe(true);
  });

  // 6. week-score / month-score based on pre-computed window values
  it("week-score tier 1 unlocks when weekBestScore >= 50", () => {
    const result = makeResult();
    const existing = makeExisting({ weekBestScore: 55 });
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    expect(
      unlocks.some((u) => u.achievementId === "week-score" && u.tier === 1),
    ).toBe(true);
  });

  it("week-score tier 3 unlocks when weekBestScore >= 77 and none previously earned", () => {
    const result = makeResult();
    const existing = makeExisting({ weekBestScore: 77 });
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    const tiers = unlocks
      .filter((u) => u.achievementId === "week-score")
      .map((u) => u.tier);
    expect(tiers).toContain(3);
  });

  it("month-score tier 2 unlocks when monthBestScore >= 200 and tier 1 already earned", () => {
    const result = makeResult();
    const existing = makeExisting({
      monthBestScore: 210,
      earnedTiers: { "month-score": 1 },
    });
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    const tiers = unlocks
      .filter((u) => u.achievementId === "month-score")
      .map((u) => u.tier);
    expect(tiers).toContain(2);
    expect(tiers).not.toContain(1); // already earned
  });

  // 7. Replayed playId returns [] (covered above in test 1 group, but explicit here)
  it("returns [] for a previously evaluated playId", () => {
    const result = makeResult({
      playId: "dup-play",
      score: 11,
      completed: true,
    });
    const existing = makeExisting({ evaluatedPlayIds: ["dup-play"] });
    expect(
      evaluateAchievements(result, existing, defaultAchievementConfig, NOW),
    ).toEqual([]);
  });

  // 8. Streak milestones emit at correct thresholds
  it("streak-7 unlocks when playedStreak >= 7 (daily)", () => {
    const result = makeResult({ mode: "daily" });
    const existing = makeExisting({ playedStreak: 7 });
    const ids = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).toContain("streak-7");
    expect(ids).not.toContain("streak-30");
  });

  it("streak-30 unlocks when playedStreak >= 30", () => {
    const result = makeResult({ mode: "daily" });
    const existing = makeExisting({ playedStreak: 30 });
    const ids = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).toContain("streak-7");
    expect(ids).toContain("streak-30");
  });

  it("streak milestones are one-time — already earned ones are skipped", () => {
    const result = makeResult({ mode: "daily" });
    const existing = makeExisting({
      playedStreak: 30,
      earnedTiers: { "streak-7": 3, "streak-30": 3 },
    });
    const ids = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).not.toContain("streak-7");
    expect(ids).not.toContain("streak-30");
  });

  it("streak-100 and streak-365 unlock at correct thresholds", () => {
    const result = makeResult({ mode: "daily" });
    const check = (streak: number) =>
      evaluateAchievements(
        result,
        makeExisting({ playedStreak: streak }),
        defaultAchievementConfig,
        NOW,
      ).map((u) => u.achievementId);

    expect(check(100)).toContain("streak-100");
    expect(check(365)).toContain("streak-365");
    expect(check(99)).not.toContain("streak-100");
  });

  // 9. phoenix emits when playedStreak===1 and bestPlayedStreak>=30
  it("phoenix unlocks when playedStreak===1 and bestPlayedStreak>=30", () => {
    const result = makeResult({ mode: "daily" });
    const existing = makeExisting({ playedStreak: 1, bestPlayedStreak: 30 });
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    expect(
      unlocks.some((u) => u.achievementId === "phoenix" && u.tier === 3),
    ).toBe(true);
  });

  it("phoenix does not unlock when bestPlayedStreak < 30", () => {
    const result = makeResult({ mode: "daily" });
    const existing = makeExisting({ playedStreak: 1, bestPlayedStreak: 29 });
    const ids = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).not.toContain("phoenix");
  });

  it("phoenix does not unlock when playedStreak > 1 (streak not just broken)", () => {
    const result = makeResult({ mode: "daily" });
    const existing = makeExisting({ playedStreak: 2, bestPlayedStreak: 50 });
    const ids = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    ).map((u) => u.achievementId);
    expect(ids).not.toContain("phoenix");
  });

  // 10. Multiple tier unlocks in a single call when count crosses multiple thresholds
  it("emits multiple tiers in one call when count jumps past multiple thresholds", () => {
    // counts["it-goes-to-11"]=9, this play qualifies → newCount=10
    // tiers=[1,10,100]: crosses tier 1 (>=1) and tier 2 (>=10), earnedTier=0 → both emitted
    const result = makeResult({ score: 11, completed: true });
    const existing = makeExisting({
      counts: { "it-goes-to-11": 9 },
      earnedTiers: {},
    });
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    const itTiers = unlocks
      .filter((u) => u.achievementId === "it-goes-to-11")
      .map((u) => u.tier)
      .sort();
    expect(itTiers).toEqual([1, 2]);
  });

  it("emits only the newly crossed tier when lower tiers already earned", () => {
    // Bronze already earned (earnedTier=1), count crosses tier 2 threshold
    const result = makeResult({ score: 11, completed: true });
    const existing = makeExisting({
      counts: { "it-goes-to-11": 9 },
      earnedTiers: { "it-goes-to-11": 1 },
    });
    const unlocks = evaluateAchievements(
      result,
      existing,
      defaultAchievementConfig,
      NOW,
    );
    const itTiers = unlocks
      .filter((u) => u.achievementId === "it-goes-to-11")
      .map((u) => u.tier);
    expect(itTiers).toEqual([2]);
  });
});
