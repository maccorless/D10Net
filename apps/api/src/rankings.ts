export type Ranking = { score: number; elapsedMs: number; acceptedAt: number };
export function sortRankings<T extends Ranking>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.score - a.score || a.elapsedMs - b.elapsedMs || a.acceptedAt - b.acceptedAt);
}
