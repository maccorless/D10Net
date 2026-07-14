export type AchievementResult = {
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
  tags: string[];
};

export type AchievementUnlock = {
  achievementId: string;
  tier: 1 | 2 | 3;
  unlockedAt: string;
  playId: string;
};

export type AchievementConfig = {
  fastFinishMs: [number, number, number];
  weekScorePts: [number, number, number];
  monthScorePts: [number, number, number];
  streakMilestones: number[];
  oracleConsecutive: [number, number, number];
  lifetimeCountTiers: [number, number, number];
};

export const defaultAchievementConfig: AchievementConfig = {
  fastFinishMs: [120_000, 60_000, 30_000],
  weekScorePts: [50, 70, 77],
  monthScorePts: [100, 200, 300],
  streakMilestones: [7, 30, 100, 365],
  oracleConsecutive: [3, 5, 10],
  lifetimeCountTiers: [1, 10, 100],
};

function newTierUnlocks(
  id: string,
  count: number,
  tiers: [number, number, number],
  earnedTiers: Record<string, number>,
  playId: string,
  now: string,
): AchievementUnlock[] {
  const earned = earnedTiers[id] ?? 0;
  const unlocks: AchievementUnlock[] = [];
  for (let i = 0; i < tiers.length; i++) {
    if (count >= tiers[i] && earned < i + 1) {
      unlocks.push({
        achievementId: id,
        tier: (i + 1) as 1 | 2 | 3,
        unlockedAt: now,
        playId,
      });
    }
  }
  return unlocks;
}

export function evaluateAchievements(
  result: AchievementResult,
  existing: {
    counts: Record<string, number>;
    earnedTiers: Record<string, number>;
    oracleStreak: number;
    evaluatedPlayIds: string[];
    playedStreak: number;
    bestPlayedStreak: number;
    weekBestScore: number;
    monthBestScore: number;
  },
  config: AchievementConfig = defaultAchievementConfig,
  now: string = new Date().toISOString(),
): AchievementUnlock[] {
  // Step 0: idempotency
  if (existing.evaluatedPlayIds.includes(result.playId)) return [];

  const { earnedTiers, counts } = existing;
  const unlocks: AchievementUnlock[] = [];

  // Tiered count achievements (daily or archive)
  const countAchievements: Array<[string, boolean]> = [
    ["it-goes-to-11", result.score === 11 && result.completed],
    ["perfect-ten", result.answersFound === 10],
    ["full-deck", result.answersFound === 10 && result.strikesUsed === 0],
    ["purist", result.answersFound === 10 && result.hintMode === "off"],
    ["called-it", result.completed && result.score > result.answersFound],
  ];

  for (const [id, qualifies] of countAchievements) {
    if (qualifies) {
      const newCount = (counts[id] ?? 0) + 1;
      unlocks.push(
        ...newTierUnlocks(
          id,
          newCount,
          config.lifetimeCountTiers,
          earnedTiers,
          result.playId,
          now,
        ),
      );
    }
  }

  // Oracle (daily or archive)
  const calledItCorrectly =
    result.completed && result.score > result.answersFound;
  const newOracleStreak = calledItCorrectly ? existing.oracleStreak + 1 : 0;
  if (newOracleStreak > 0) {
    const oracleEarned = earnedTiers["oracle"] ?? 0;
    for (let i = 0; i < config.oracleConsecutive.length; i++) {
      if (
        newOracleStreak >= config.oracleConsecutive[i] &&
        oracleEarned < i + 1
      ) {
        unlocks.push({
          achievementId: "oracle",
          tier: (i + 1) as 1 | 2 | 3,
          unlockedAt: now,
          playId: result.playId,
        });
      }
    }
  }

  // Daily-only achievements
  if (result.mode === "daily") {
    // Fast Finish (answersFound === 10)
    if (result.answersFound === 10) {
      const ffEarned = earnedTiers["fast-finish"] ?? 0;
      for (let i = 0; i < config.fastFinishMs.length; i++) {
        if (result.elapsedMs < config.fastFinishMs[i] && ffEarned < i + 1) {
          unlocks.push({
            achievementId: "fast-finish",
            tier: (i + 1) as 1 | 2 | 3,
            unlockedAt: now,
            playId: result.playId,
          });
        }
      }
    }

    // Streak milestones (one-time, tier 3)
    for (const n of config.streakMilestones) {
      if (
        existing.playedStreak >= n &&
        (earnedTiers[`streak-${n}`] ?? 0) === 0
      ) {
        unlocks.push({
          achievementId: `streak-${n}`,
          tier: 3,
          unlockedAt: now,
          playId: result.playId,
        });
      }
    }

    // Week score
    const weekEarned = earnedTiers["week-score"] ?? 0;
    for (let i = 0; i < config.weekScorePts.length; i++) {
      if (
        existing.weekBestScore >= config.weekScorePts[i] &&
        weekEarned < i + 1
      ) {
        unlocks.push({
          achievementId: "week-score",
          tier: (i + 1) as 1 | 2 | 3,
          unlockedAt: now,
          playId: result.playId,
        });
      }
    }

    // Month score
    const monthEarned = earnedTiers["month-score"] ?? 0;
    for (let i = 0; i < config.monthScorePts.length; i++) {
      if (
        existing.monthBestScore >= config.monthScorePts[i] &&
        monthEarned < i + 1
      ) {
        unlocks.push({
          achievementId: "month-score",
          tier: (i + 1) as 1 | 2 | 3,
          unlockedAt: now,
          playId: result.playId,
        });
      }
    }

    // Phoenix (one-time, tier 3)
    if (
      existing.playedStreak === 1 &&
      existing.bestPlayedStreak >= 30 &&
      (earnedTiers["phoenix"] ?? 0) === 0
    ) {
      unlocks.push({
        achievementId: "phoenix",
        tier: 3,
        unlockedAt: now,
        playId: result.playId,
      });
    }
  }

  // Deduplicate by achievementId+tier
  const seen = new Set<string>();
  return unlocks.filter((u) => {
    const key = `${u.achievementId}:${u.tier}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
