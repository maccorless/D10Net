import { describe, expect, it } from "vitest";
import { parseBoards, parseItems, combine } from "./parseClipboard";

const boardsHeader =
  "board_id\ttitle\tprompt\tmetric_desc\ttheme_tags\tranking_source_name\tranking_source_url\tuniverse_source_name\tuniverse_source_url\tdata_as_of\tuniverse_as_of\tuniverse_description\tuniverse_size\tnotes";
const itemsHeader =
  "board_id\trow_type\trank\tcanonical_value\taliases\tmetric_value\tnotes";

function boardRow(id: string) {
  return `${id}\t${id} title\tRank the top 10\tPopulation\tgeo|cities\tCensus\thttps://example.gov\tUN\thttps://un.org\t\t\t\t\t`;
}

function itemRows(id: string, universeSize = 20) {
  const top10 = Array.from(
    { length: 10 },
    (_, i) =>
      `${id}\tTOP10\t${i + 1}\t${id}-item-${i + 1}\tAlias ${i + 1}\t${10 - i} million\t`,
  );
  const extra = Array.from(
    { length: universeSize - 10 },
    (_, i) => `${id}\tUNIVERSE\t\t${id}-item-${i + 11}\t\t\t`,
  );
  return [...top10, ...extra];
}

describe("parseBoards", () => {
  it("parses valid boards header and rows", () => {
    const result = parseBoards([boardsHeader, boardRow("b1")].join("\n"));
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[])[0].boardId).toBe("b1");
  });

  it("returns an error on header mismatch", () => {
    const result = parseBoards(
      boardsHeader.replace("board_id", "id") + "\n" + boardRow("b1"),
    );
    expect((result as any).column).toBe("header");
  });
});

describe("parseItems", () => {
  it("parses TOP10 and UNIVERSE rows", () => {
    const tsv = [itemsHeader, ...itemRows("b1")].join("\n");
    const result = parseItems(tsv);
    expect(Array.isArray(result)).toBe(true);
    expect((result as any[]).filter((r) => r.rowType === "TOP10")).toHaveLength(
      10,
    );
  });

  it("returns an error on header mismatch", () => {
    const result = parseItems(itemsHeader.replace("board_id", "id") + "\n");
    expect((result as any).column).toBe("header");
  });
});

describe("combine", () => {
  it("produces a valid board from matching boards and items rows", () => {
    const boards = parseBoards(
      [boardsHeader, boardRow("b1")].join("\n"),
    ) as any[];
    const items = parseItems(
      [itemsHeader, ...itemRows("b1")].join("\n"),
    ) as any[];
    const { validBoards, errors } = combine(boards, items);
    expect(errors).toHaveLength(0);
    expect(validBoards).toHaveLength(1);
    expect(validBoards[0].ranked).toHaveLength(10);
    expect(validBoards[0].universe.length).toBeGreaterThanOrEqual(10);
  });

  it("handles multiple boards in one paste", () => {
    const boards = parseBoards(
      [boardsHeader, boardRow("b1"), boardRow("b2")].join("\n"),
    ) as any[];
    const items = parseItems(
      [itemsHeader, ...itemRows("b1"), ...itemRows("b2")].join("\n"),
    ) as any[];
    const { validBoards } = combine(boards, items);
    expect(validBoards).toHaveLength(2);
  });

  it("errors when TOP10 count is not 10", () => {
    const boards = parseBoards(
      [boardsHeader, boardRow("b1")].join("\n"),
    ) as any[];
    const only9 = itemRows("b1").slice(0, 9); // 9 TOP10 rows only
    const items = parseItems([itemsHeader, ...only9].join("\n")) as any[];
    const { validBoards, errors } = combine(boards, items);
    expect(validBoards).toHaveLength(0);
    expect(errors[0].message).toMatch(/10 TOP10/);
  });

  it("retains valid boards when another board errors", () => {
    const boards = parseBoards(
      [boardsHeader, boardRow("good"), boardRow("bad")].join("\n"),
    ) as any[];
    const items = parseItems(
      [itemsHeader, ...itemRows("good"), ...itemRows("bad").slice(0, 5)].join(
        "\n",
      ),
    ) as any[];
    const { validBoards, errors } = combine(boards, items);
    expect(validBoards.map((b) => b.id)).toEqual(["good"]);
    expect(errors.some((e) => e.boardId === "bad")).toBe(true);
  });
});
