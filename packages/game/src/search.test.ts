import { expect, it } from "vitest";
import { validCitiesBoard } from "@daily/test-data/boards";
import { createGame, submitGuess } from "./engine.js";
import { searchRemaining } from "./search.js";

it("finds normalized aliases but returns canonical available candidates", () => {
  const board = {
    ...validCitiesBoard,
    universe: validCitiesBoard.universe.map((candidate) =>
      candidate.label === "Mexico City" ? { ...candidate, aliases: ["Ciudad de México", "CDMX"] } : candidate
    )
  };
  const state = createGame(board, "on", { playId: "search-play", startedAtMs: 0 });
  expect(searchRemaining(state, "mexico")[0]).toMatchObject({ label: "Mexico City" });
  expect(searchRemaining(state, "cd-mx")[0]).toMatchObject({ label: "Mexico City" });
  expect(searchRemaining(state, "")).toEqual([]);
  expect(searchRemaining(submitGuess(state, "city-6", false, 10), "cdmx")).toEqual([]);
});
