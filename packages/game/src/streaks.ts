import type { HintMode } from "@daily/contracts";

export type Streak = { current: number; best: number; lastGameDay: string | null };
export type Streaks = { played: Streak; fivePlus: Streak; perfect: Streak; noHint: Streak };
const blank = (): Streak => ({ current: 0, best: 0, lastGameDay: null });
export const emptyStreaks: Streaks = { played: blank(), fivePlus: blank(), perfect: blank(), noHint: blank() };
type DailyResult = { score: number; answersFound: number; hintMode: HintMode };

const previousDay = (day: string) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
};

function apply(streak: Streak, qualifies: boolean, day: string): Streak {
  if (streak.lastGameDay === day) return streak;
  if (!qualifies) return { ...streak, current: 0, lastGameDay: day };
  const current = streak.lastGameDay === previousDay(day) ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastGameDay: day };
}

export function applyDailyResult(streaks: Streaks, result: DailyResult, gameDay: string): Streaks {
  if (gameDay === "archive") return streaks;
  return {
    played: apply(streaks.played, true, gameDay),
    fivePlus: apply(streaks.fivePlus, result.answersFound >= 5, gameDay),
    perfect: apply(streaks.perfect, result.answersFound === 10, gameDay),
    noHint: apply(streaks.noHint, result.answersFound === 10 && result.hintMode === "off", gameDay)
  };
}
