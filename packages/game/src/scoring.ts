import type { GameState } from "./engine.js";

export type GameResult = {
  answersFound: number;
  score: number;
  strikes: number;
  completed: boolean;
};

export function deriveResult(state: GameState): GameResult {
  const answersFound = state.foundIds.length;
  return {
    answersFound,
    score: Math.min(11, answersFound + Number(state.numberOneBonus)),
    strikes: state.strikes,
    completed: answersFound === 10 || state.strikes === 5
  };
}
