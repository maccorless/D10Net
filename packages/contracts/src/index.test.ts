import { describe, expect, it } from "vitest";
import {
  BoardsCsvRowSchema,
  ItemsCsvRowSchema,
  BoardSchema,
  PlayStartSchema,
  StartedGameSchema,
} from "./index";
import { validCitiesBoard } from "@daily/test-data/boards";

describe("BoardSchema", () => {
  it("accepts exactly ten ranked answers from the universe", () => {
    expect(BoardSchema.parse(validCitiesBoard).ranked).toHaveLength(10);
  });

  it("rejects a ranked answer missing from the universe", () => {
    const invalid = {
      ...validCitiesBoard,
      ranked: [...validCitiesBoard.ranked.slice(0, 9), "missing"],
    };
    expect(() => BoardSchema.parse(invalid)).toThrow(/universe/i);
  });

  it("rejects duplicate ranked answers", () => {
    const invalid = {
      ...validCitiesBoard,
      ranked: [
        validCitiesBoard.ranked[0],
        ...validCitiesBoard.ranked.slice(0, 9),
      ],
    };
    expect(() => BoardSchema.parse(invalid)).toThrow(/duplicate ranked/i);
  });

  it("rejects duplicate candidate IDs in the universe", () => {
    const invalid = {
      ...validCitiesBoard,
      universe: validCitiesBoard.universe.map((candidate, index) =>
        index === 49
          ? { ...candidate, id: validCitiesBoard.universe[0].id }
          : candidate,
      ),
    };
    expect(() => BoardSchema.parse(invalid)).toThrow(/duplicate universe/i);
  });

  it("requires a metric value for every ranked answer", () => {
    const invalid = {
      ...validCitiesBoard,
      universe: validCitiesBoard.universe.map((candidate, index) =>
        index === 0 ? { ...candidate, metricValue: undefined } : candidate,
      ),
    };
    expect(() => BoardSchema.parse(invalid)).toThrow(/metric value/i);
  });

  it("requires a positive board version", () => {
    expect(() =>
      BoardSchema.parse({ ...validCitiesBoard, version: 0 }),
    ).toThrow();
  });
});

describe("StartedGameSchema", () => {
  it("couples one issued play to its exact public board", () => {
    const play = {
      playId: "123e4567-e89b-12d3-a456-426614174000",
      gameDay: "2026-07-11",
      boardId: validCitiesBoard.id,
      boardVersion: 1,
      startedAt: "2026-07-11T12:00:00.000Z",
      mode: "daily",
      hintMode: "off",
      validationEnvelope: "issued",
    };
    expect(
      StartedGameSchema.parse({ play, board: validCitiesBoard }).play.playId,
    ).toBe(play.playId);
    expect(() =>
      StartedGameSchema.parse({
        play: { ...play, boardId: "future" },
        board: validCitiesBoard,
      }),
    ).toThrow(/match/i);
  });
});

describe("PlayStartSchema", () => {
  it("requires a positive board version", () => {
    expect(() =>
      PlayStartSchema.parse({
        playId: "123e4567-e89b-12d3-a456-426614174000",
        gameDay: "2026-07-11",
        boardId: "largest-cities",
        boardVersion: 0,
        startedAt: "2026-07-11T12:00:00.000Z",
        mode: "daily",
        hintMode: "off",
        validationEnvelope: "signed",
      }),
    ).toThrow();
  });
});

describe("BoardsCsvRowSchema", () => {
  const valid = {
    boardId: "largest-cities",
    title: "Largest Cities",
    prompt: "Rank the 10 largest cities",
    metricDesc: "Population",
    themeTags: "geography",
    rankingSourceName: "UN",
    rankingSourceUrl: "https://www.un.org/",
    universeSourceName: "UN",
    universeSourceUrl: "https://www.un.org/",
  };
  it("accepts a valid boards CSV row", () => {
    expect(BoardsCsvRowSchema.parse(valid).boardId).toBe("largest-cities");
  });
  it("accepts a non-URL ranking source (URLs are not strictly validated)", () => {
    expect(
      BoardsCsvRowSchema.parse({ ...valid, rankingSourceUrl: "Wikipedia" })
        .rankingSourceUrl,
    ).toBe("Wikipedia");
  });
});

describe("ItemsCsvRowSchema", () => {
  const valid = {
    boardId: "b1",
    rowType: "TOP10" as const,
    rank: 1,
    canonicalValue: "Tokyo",
    aliases: "",
  };
  it("accepts a valid TOP10 item row", () => {
    expect(ItemsCsvRowSchema.parse(valid).rank).toBe(1);
  });
  it("rejects an invalid rowType", () => {
    expect(() =>
      ItemsCsvRowSchema.parse({ ...valid, rowType: "INVALID" }),
    ).toThrow();
  });
  it("accepts rank > 10 (UNIVERSE near-miss items can have rank 11+)", () => {
    expect(ItemsCsvRowSchema.parse({ ...valid, rank: 11 }).rank).toBe(11);
  });
});
