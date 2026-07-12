import type { GameState } from "./engine.js";

const normalize = (value: string) =>
  value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function searchRemaining(state: GameState, query: string) {
  const needle = normalize(query);
  if (needle.length < 1) return [];
  return state.board.universe.filter(
    (candidate) =>
      state.availableIds.includes(candidate.id) &&
      [candidate.label, ...candidate.aliases].some((value) => normalize(value).includes(needle))
  );
}
