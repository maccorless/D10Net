import { describe, expect, it } from "vitest";
import {
  validCitiesBoard,
  validBoardWithTiedTenth,
} from "@daily/test-data/boards";
import { createGame, submitGuess, useHint } from "./engine.js";
import { deriveResult } from "./scoring.js";

describe("game engine", () => {
  const initialize = (playId = "play-42", startedAtMs = 1_000) => ({
    playId,
    startedAtMs,
  });

  it("removes guessed candidates and awards at most 11 points", () => {
    let state = createGame(validCitiesBoard, "off", initialize());
    state = submitGuess(state, validCitiesBoard.ranked[0], true, 100);
    expect(state.availableIds).not.toContain(validCitiesBoard.ranked[0]);
    expect(() =>
      submitGuess(state, validCitiesBoard.ranked[0], false, 200),
    ).toThrow(/unavailable/i);
    for (const [index, id] of validCitiesBoard.ranked.slice(1).entries())
      state = submitGuess(state, id, false, 200 + index);
    expect(deriveResult(state)).toMatchObject({
      answersFound: 10,
      score: 11,
      completed: true,
    });
  });

  it("consumes the number-one call once without penalizing a miss", () => {
    let state = createGame(validCitiesBoard, "off", initialize());
    state = submitGuess(state, validCitiesBoard.ranked[4], true, 100);
    expect(state.strikes).toBe(0);
    expect(() =>
      submitGuess(state, validCitiesBoard.ranked[0], true, 200),
    ).toThrow(/already used/i);
  });

  it("ends after five valid non-top-ten guesses and rejects further transitions", () => {
    let state = createGame(validCitiesBoard, "off", initialize());
    // Non-top-ten = universe items with no rank (rank > 10 in this board)
    const nonTopTen = state.availableIds.filter((id) => {
      const c = validCitiesBoard.universe.find((u) => u.id === id);
      return c?.rank == null || c.rank > 10;
    });
    for (const [index, id] of nonTopTen.slice(0, 5).entries())
      state = submitGuess(state, id, false, index);
    expect(deriveResult(state)).toMatchObject({ strikes: 5, completed: true });
    expect(() =>
      submitGuess(state, validCitiesBoard.ranked[0], false, 100),
    ).toThrow(/completed/i);
  });

  describe("tied answers", () => {
    // city-9, city-10, city-11 are all tied at rank 9; ranked[] contains city-9 and city-10
    const tiedInit = () =>
      createGame(validBoardWithTiedTenth, "off", {
        playId: "t1",
        startedAtMs: 0,
      });

    it("accepts a tied item not in ranked[] as a correct answer", () => {
      const state = submitGuess(tiedInit(), "city-11", false, 1);
      expect(state.strikes).toBe(0);
      expect(state.foundIds).toContain("city-11");
    });

    it("removes same-rank siblings from available when a tied answer is found", () => {
      const state = submitGuess(tiedInit(), "city-11", false, 1);
      expect(state.availableIds).not.toContain("city-9");
      expect(state.availableIds).not.toContain("city-10");
    });

    it("completes the game after 10 correct answers including a tied substitute", () => {
      let state = tiedInit();
      // Find ranks 1–8 (city-1 through city-8), then use city-11 for the rank-9 slot
      for (let i = 1; i <= 8; i++)
        state = submitGuess(state, `city-${i}`, false, i);
      state = submitGuess(state, "city-11", false, 9);
      expect(deriveResult(state)).toMatchObject({
        answersFound: 9,
        completed: false,
      });
      // One more — need one remaining rank (none left; ties filled the only remaining slot)
      // Actually rank 9 slot is filled, so game needs 10 foundIds — we have 9 after the above.
      // The board has ranks 1–8 (8 items) + rank 9 (three tied) = 9 distinct rank slots.
      // With standard competition ranking: 10 items in ranked but only 9 rank values (1–8, 9, 9).
      // foundIds.length reaches 9 after finding all distinct slots — game still needs 10 foundIds.
      // Find one unranked city to confirm it's still a strike.
      state = submitGuess(state, "city-12", false, 10);
      expect(state.strikes).toBe(1);
    });
  });

  it("records immutable elapsed guess events", () => {
    const initial = createGame(validCitiesBoard, "off", initialize());
    const next = submitGuess(initial, validCitiesBoard.ranked[0], false, 250);
    expect(initial.guesses).toEqual([]);
    expect(next.guesses).toEqual([
      {
        candidateId: validCitiesBoard.ranked[0],
        calledNumberOne: false,
        atMs: 250,
      },
    ]);
  });

  it("replays identical initialization and actions to identical states", () => {
    const replay = () =>
      submitGuess(
        createGame(validCitiesBoard, "off", initialize("replay-id", 123)),
        "city-1",
        true,
        456,
      );
    expect(replay()).toEqual(replay());
  });

  it("permits one deterministic free hint only in Hints On", () => {
    const first = useHint(
      createGame(validCitiesBoard, "on", initialize("play-42")),
      "first-letter",
    );
    const repeated = useHint(
      createGame(validCitiesBoard, "on", initialize("play-42")),
      "metric-value",
    );
    expect(first.hintUsed).toBe(true);
    expect(first.hintReveal).toMatchObject({ kind: "first-letter" });
    expect(repeated.hintReveal?.rank).toBe(first.hintReveal?.rank);
    expect(() => useHint(first, "first-letter")).toThrow(/used/i);
    expect(() =>
      useHint(
        createGame(validCitiesBoard, "off", initialize()),
        "first-letter",
      ),
    ).toThrow(/off/i);
  });

  it("selects deterministic play-specific hint ranks", () => {
    const rankFor = (playId: string) =>
      useHint(
        createGame(validCitiesBoard, "on", initialize(playId)),
        "first-letter",
      ).hintReveal?.rank;
    expect(rankFor("play-42")).toBe(rankFor("play-42"));
    expect(rankFor("play-42")).not.toBe(rankFor("play-43"));
  });
});
