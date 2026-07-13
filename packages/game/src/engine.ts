import type { Board, GuessEvent, HintMode } from "@daily/contracts";

export type HintKind = "first-letter" | "metric-value";

export type HintReveal = {
  rank: number;
  kind: HintKind;
  value: string;
};

export type GameState = {
  board: Board;
  hintMode: HintMode;
  playId: string;
  availableIds: string[];
  foundIds: string[];
  guesses: GuessEvent[];
  strikes: number;
  numberOneCallUsed: boolean;
  numberOneBonus: boolean;
  hintUsed: boolean;
  hintReveal?: HintReveal;
  startedAtMs: number;
};

export type GameInitialization = {
  playId: string;
  startedAtMs: number;
};

export function createGame(
  board: Board,
  hintMode: HintMode,
  initialization: GameInitialization,
): GameState {
  return {
    board,
    hintMode,
    playId: initialization.playId,
    availableIds: board.universe.map(({ id }) => id),
    foundIds: [],
    guesses: [],
    strikes: 0,
    numberOneCallUsed: false,
    numberOneBonus: false,
    hintUsed: false,
    startedAtMs: initialization.startedAtMs,
  };
}

function assertInProgress(state: GameState): void {
  if (state.foundIds.length === 10 || state.strikes === 5) {
    throw new Error("Game is already completed");
  }
}

export function submitGuess(
  state: GameState,
  candidateId: string,
  calledNumberOne: boolean,
  atMs: number,
): GameState {
  assertInProgress(state);
  if (!state.availableIds.includes(candidateId))
    throw new Error("Candidate is unavailable");
  if (calledNumberOne && state.numberOneCallUsed)
    throw new Error("Number-one call already used");

  const candidate = state.board.universe.find((c) => c.id === candidateId);
  const correct = candidate?.rank != null && candidate.rank <= 10;

  // When a rank slot is filled, remove all other same-rank items so the
  // slot cannot be answered twice (e.g. three items tied for 10th).
  const tiedSiblingIds =
    correct && candidate.rank != null
      ? state.board.universe
          .filter((c) => c.rank === candidate.rank && c.id !== candidateId)
          .map((c) => c.id)
      : [];

  const removedIds = new Set([candidateId, ...tiedSiblingIds]);

  return {
    ...state,
    availableIds: state.availableIds.filter((id) => !removedIds.has(id)),
    foundIds: correct ? [...state.foundIds, candidateId] : state.foundIds,
    strikes: state.strikes + (correct ? 0 : 1),
    numberOneCallUsed: state.numberOneCallUsed || calledNumberOne,
    numberOneBonus:
      state.numberOneBonus ||
      (calledNumberOne && candidateId === state.board.ranked[0]),
    guesses: [...state.guesses, { candidateId, calledNumberOne, atMs }],
  };
}

// Returns the CSV rank of a candidate (same number for tied items), or null if not in the top 10.
export function getGuessRank(candidateId: string, board: Board): number | null {
  return board.universe.find((c) => c.id === candidateId)?.rank ?? null;
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0;
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function useHint(state: GameState, kind: HintKind): GameState {
  assertInProgress(state);
  if (state.hintMode === "off") throw new Error("Hints are off");
  if (state.hintUsed) throw new Error("Free hint already used");

  const remainingRanks = state.board.ranked
    .map((candidateId, index) => ({ candidateId, rank: index + 1 }))
    .filter(({ candidateId }) => state.availableIds.includes(candidateId));
  const selected = remainingRanks[hash(state.playId) % remainingRanks.length];
  const candidate = state.board.universe.find(
    ({ id }) => id === selected.candidateId,
  );
  if (!candidate)
    throw new Error("Hint candidate is absent from the board universe");

  return {
    ...state,
    hintUsed: true,
    hintReveal: {
      rank: selected.rank,
      kind,
      value:
        kind === "first-letter"
          ? candidate.label.charAt(0)
          : candidate.metricValue!,
    },
  };
}
