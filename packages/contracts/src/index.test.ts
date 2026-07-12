import { describe, expect, it } from "vitest";
import { BoardImportRowSchema, BoardSchema, PlayStartSchema, StartedGameSchema } from "./index";
import { validCitiesBoard } from "@daily/test-data/boards";

describe("BoardSchema", () => {
  it("accepts exactly ten ranked answers from the universe", () => {
    expect(BoardSchema.parse(validCitiesBoard).ranked).toHaveLength(10);
  });

  it("rejects a ranked answer missing from the universe", () => {
    const invalid = { ...validCitiesBoard, ranked: [...validCitiesBoard.ranked.slice(0, 9), "missing"] };
    expect(() => BoardSchema.parse(invalid)).toThrow(/universe/i);
  });

  it("rejects duplicate ranked answers", () => {
    const invalid = {
      ...validCitiesBoard,
      ranked: [validCitiesBoard.ranked[0], ...validCitiesBoard.ranked.slice(0, 9)]
    };
    expect(() => BoardSchema.parse(invalid)).toThrow(/duplicate ranked/i);
  });

  it("rejects duplicate candidate IDs in the universe", () => {
    const invalid = {
      ...validCitiesBoard,
      universe: validCitiesBoard.universe.map((candidate, index) =>
        index === 49 ? { ...candidate, id: validCitiesBoard.universe[0].id } : candidate
      )
    };
    expect(() => BoardSchema.parse(invalid)).toThrow(/duplicate universe/i);
  });

  it("requires a metric value for every ranked answer", () => {
    const invalid = {
      ...validCitiesBoard,
      universe: validCitiesBoard.universe.map((candidate, index) =>
        index === 0 ? { ...candidate, metricValue: undefined } : candidate
      )
    };
    expect(() => BoardSchema.parse(invalid)).toThrow(/metric value/i);
  });

  it("requires a positive board version", () => {
    expect(() => BoardSchema.parse({ ...validCitiesBoard, version: 0 })).toThrow();
  });
});

describe("StartedGameSchema", () => {
  it("couples one issued play to its exact public board", () => {
    const play = { playId: "123e4567-e89b-12d3-a456-426614174000", gameDay: "2026-07-11", boardId: validCitiesBoard.id, boardVersion: 1, startedAt: "2026-07-11T12:00:00.000Z", mode: "daily", hintMode: "off", validationEnvelope: "issued" };
    expect(StartedGameSchema.parse({ play, board: validCitiesBoard }).play.playId).toBe(play.playId);
    expect(() => StartedGameSchema.parse({ play: { ...play, boardId: "future" }, board: validCitiesBoard })).toThrow(/match/i);
  });
});

describe("PlayStartSchema", () => {
  it("requires a positive board version", () => {
    expect(() => PlayStartSchema.parse({
      playId: "123e4567-e89b-12d3-a456-426614174000",
      gameDay: "2026-07-11",
      boardId: "largest-cities",
      boardVersion: 0,
      startedAt: "2026-07-11T12:00:00.000Z",
      mode: "daily",
      hintMode: "off",
      validationEnvelope: "signed"
    })).toThrow();
  });
});

describe("BoardImportRowSchema", () => {
  it("accepts a valid publisher import row", () => {
    expect(BoardImportRowSchema.parse({
      boardId: "largest-cities",
      version: 1,
      gameDay: null,
      title: "Largest Cities",
      metric: "Population",
      tags: "geography",
      sourceName: "United Nations",
      sourceUrl: "https://www.un.org/",
      candidateId: "tokyo",
      candidateLabel: "Tokyo",
      aliases: "",
      metricValue: "37 million",
      rank: 1
    }).rank).toBe(1);
  });

  it("rejects non-positive versions and out-of-range ranks", () => {
    const row = {
      boardId: "largest-cities", version: 0, gameDay: null, title: "Largest Cities",
      metric: "Population", tags: "geography", sourceName: "United Nations",
      sourceUrl: "https://www.un.org/", candidateId: "tokyo", candidateLabel: "Tokyo",
      aliases: "", rank: 11
    };
    expect(() => BoardImportRowSchema.parse(row)).toThrow();
  });
});
