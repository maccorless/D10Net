import { describe, expect, it } from "vitest";
import { validCitiesBoard } from "@daily/test-data/boards";
import { createGame, submitGuess, useHint } from "./engine.js";
import { deriveResult } from "./scoring.js";

describe("game engine", () => {
  const initialize = (playId = "play-42", startedAtMs = 1_000) => ({ playId, startedAtMs });

  it("removes guessed candidates and awards at most 11 points", () => {
    let state = createGame(validCitiesBoard, "off", initialize());
    state = submitGuess(state, validCitiesBoard.ranked[0], true, 100);
    expect(state.availableIds).not.toContain(validCitiesBoard.ranked[0]);
    expect(() => submitGuess(state, validCitiesBoard.ranked[0], false, 200)).toThrow(/unavailable/i);
    for (const [index, id] of validCitiesBoard.ranked.slice(1).entries()) state = submitGuess(state, id, false, 200 + index);
    expect(deriveResult(state)).toMatchObject({ answersFound: 10, score: 11, completed: true });
  });

  it("consumes the number-one call once without penalizing a miss", () => {
    let state = createGame(validCitiesBoard, "off", initialize());
    state = submitGuess(state, validCitiesBoard.ranked[4], true, 100);
    expect(state.strikes).toBe(0);
    expect(() => submitGuess(state, validCitiesBoard.ranked[0], true, 200)).toThrow(/already used/i);
  });

  it("ends after five valid non-top-ten guesses and rejects further transitions", () => {
    let state = createGame(validCitiesBoard, "off", initialize());
    for (const [index, id] of state.availableIds.filter((id) => !validCitiesBoard.ranked.includes(id)).slice(0, 5).entries()) state = submitGuess(state, id, false, index);
    expect(deriveResult(state)).toMatchObject({ strikes: 5, completed: true });
    expect(() => submitGuess(state, validCitiesBoard.ranked[0], false, 100)).toThrow(/completed/i);
  });

  it("records immutable elapsed guess events", () => {
    const initial = createGame(validCitiesBoard, "off", initialize());
    const next = submitGuess(initial, validCitiesBoard.ranked[0], false, 250);
    expect(initial.guesses).toEqual([]);
    expect(next.guesses).toEqual([{ candidateId: validCitiesBoard.ranked[0], calledNumberOne: false, atMs: 250 }]);
  });

  it("replays identical initialization and actions to identical states", () => {
    const replay = () => submitGuess(createGame(validCitiesBoard, "off", initialize("replay-id", 123)), "city-1", true, 456);
    expect(replay()).toEqual(replay());
  });

  it("permits one deterministic free hint only in Hints On", () => {
    const first = useHint(createGame(validCitiesBoard, "on", initialize("play-42")), "first-letter");
    const repeated = useHint(createGame(validCitiesBoard, "on", initialize("play-42")), "metric-value");
    expect(first.hintUsed).toBe(true);
    expect(first.hintReveal).toMatchObject({ kind: "first-letter" });
    expect(repeated.hintReveal?.rank).toBe(first.hintReveal?.rank);
    expect(() => useHint(first, "first-letter")).toThrow(/used/i);
    expect(() => useHint(createGame(validCitiesBoard, "off", initialize()), "first-letter")).toThrow(/off/i);
  });

  it("selects deterministic play-specific hint ranks", () => {
    const rankFor = (playId: string) => useHint(createGame(validCitiesBoard, "on", initialize(playId)), "first-letter").hintReveal?.rank;
    expect(rankFor("play-42")).toBe(rankFor("play-42"));
    expect(rankFor("play-42")).not.toBe(rankFor("play-43"));
  });
});
