import {
  evaluateAchievements,
  defaultAchievementConfig,
  type AchievementResult,
  type AchievementUnlock,
} from "@daily/game";
import { read, write } from "../db";

export type { AchievementResult, AchievementUnlock };

export interface AchievementRecord {
  achievementId: string;
  tier: 0 | 1 | 2 | 3;
  count: number;
  bestValue?: number;
  unlockedAt: string[];
}

interface ScoreEntry {
  gameDay: string;
  score: number;
}

interface AchievementState {
  records: AchievementRecord[];
  oracleStreak: number;
  evaluatedPlayIds: string[];
  scoreHistory: ScoreEntry[]; // Daily scores only, last 30 days
}

const STATE_KEY = "state";

function emptyState(): AchievementState {
  return {
    records: [],
    oracleStreak: 0,
    evaluatedPlayIds: [],
    scoreHistory: [],
  };
}

export async function loadAchievementState(): Promise<AchievementState> {
  return (
    (await read<AchievementState>("achievements", STATE_KEY)) ?? emptyState()
  );
}

function windowBest(history: ScoreEntry[], days: number): number {
  let best = 0;
  for (let i = 0; i < history.length; i++) {
    const end = history[i].gameDay;
    // ISO date strings compare lexicographically
    const cutoff = offsetDay(end, -(days - 1));
    const sum = history
      .filter((e) => e.gameDay >= cutoff && e.gameDay <= end)
      .reduce((acc, e) => acc + e.score, 0);
    if (sum > best) best = sum;
  }
  return best;
}

function offsetDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export async function processResult(
  result: AchievementResult,
  playedStreak: { current: number; best: number },
): Promise<AchievementUnlock[]> {
  const state = await loadAchievementState();

  // Idempotency: already evaluated
  if (state.evaluatedPlayIds.includes(result.playId)) return [];

  // Update score history for Daily plays (keep last 30 days)
  if (result.mode === "daily") {
    state.scoreHistory = [
      ...state.scoreHistory.filter((e) => e.gameDay !== result.gameDay),
      { gameDay: result.gameDay, score: result.score },
    ]
      .sort((a, b) => a.gameDay.localeCompare(b.gameDay))
      .slice(-30);
  }

  const counts: Record<string, number> = {};
  const earnedTiers: Record<string, number> = {};
  for (const r of state.records) {
    counts[r.achievementId] = r.count;
    earnedTiers[r.achievementId] = r.tier;
  }

  const unlocks = evaluateAchievements(
    result,
    {
      counts,
      earnedTiers,
      oracleStreak: state.oracleStreak,
      evaluatedPlayIds: state.evaluatedPlayIds,
      playedStreak: playedStreak.current,
      bestPlayedStreak: playedStreak.best,
      weekBestScore: windowBest(state.scoreHistory, 7),
      monthBestScore: windowBest(state.scoreHistory, 30),
    },
    defaultAchievementConfig,
  );

  // Apply unlocks to records
  const calledItCorrectly =
    result.completed && result.score > result.answersFound;
  const newOracleStreak = calledItCorrectly ? state.oracleStreak + 1 : 0;

  for (const unlock of unlocks) {
    const existing = state.records.find(
      (r) => r.achievementId === unlock.achievementId,
    );
    if (existing) {
      existing.tier = Math.max(
        existing.tier,
        unlock.tier,
      ) as AchievementRecord["tier"];
      existing.unlockedAt.push(unlock.unlockedAt);
    } else {
      state.records.push({
        achievementId: unlock.achievementId,
        tier: unlock.tier,
        count: counts[unlock.achievementId] ?? 1,
        unlockedAt: [unlock.unlockedAt],
      });
    }
  }

  // Update counts for qualifying events
  const countIds = [
    "it-goes-to-11",
    "perfect-ten",
    "full-deck",
    "purist",
    "called-it",
  ] as const;
  const qualifies: Record<string, boolean> = {
    "it-goes-to-11": result.score === 11 && result.completed,
    "perfect-ten": result.answersFound === 10,
    "full-deck": result.answersFound === 10 && result.strikesUsed === 0,
    purist: result.answersFound === 10 && result.hintMode === "off",
    "called-it": result.completed && result.score > result.answersFound,
  };
  for (const id of countIds) {
    if (qualifies[id]) {
      const rec = state.records.find((r) => r.achievementId === id);
      if (rec) rec.count++;
      else
        state.records.push({
          achievementId: id,
          tier: 0,
          count: 1,
          unlockedAt: [],
        });
    }
  }

  // Fast finish bestValue
  if (result.mode === "daily" && result.answersFound === 10) {
    const ffRec = state.records.find((r) => r.achievementId === "fast-finish");
    if (ffRec) {
      ffRec.bestValue = Math.min(ffRec.bestValue ?? Infinity, result.elapsedMs);
    } else if (unlocks.some((u) => u.achievementId === "fast-finish")) {
      const newRec = state.records.find(
        (r) => r.achievementId === "fast-finish",
      );
      if (newRec) newRec.bestValue = result.elapsedMs;
    }
  }

  // Oracle bestValue
  const oracleRec = state.records.find((r) => r.achievementId === "oracle");
  if (oracleRec) {
    oracleRec.bestValue = Math.max(oracleRec.bestValue ?? 0, newOracleStreak);
  }

  state.oracleStreak = newOracleStreak;
  state.evaluatedPlayIds = [...state.evaluatedPlayIds, result.playId];

  await write("achievements", STATE_KEY, state);
  return unlocks;
}

export async function mergeFromServer(
  serverRecords: AchievementRecord[],
): Promise<void> {
  const state = await loadAchievementState();
  for (const server of serverRecords) {
    const local = state.records.find(
      (r) => r.achievementId === server.achievementId,
    );
    if (!local) {
      state.records.push(server);
    } else {
      local.tier = Math.max(
        local.tier,
        server.tier,
      ) as AchievementRecord["tier"];
      local.count = Math.max(local.count, server.count);
      if (server.bestValue !== undefined) {
        local.bestValue =
          local.bestValue !== undefined
            ? Math.min(local.bestValue, server.bestValue)
            : server.bestValue;
      }
    }
  }
  await write("achievements", STATE_KEY, state);
}
