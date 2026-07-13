import {
  BoardSchema,
  MetricFormatSchema,
  type Board,
  type BoardsCsvRow,
  type ItemsCsvRow,
} from "@daily/contracts";

export type ImportError = {
  boardId: string;
  row: number;
  column: string;
  message: string;
};
export type ParseResult = { validBoards: Board[]; errors: ImportError[] };

const BOARDS_COLUMNS = [
  "board_id",
  "title",
  "prompt",
  "metric_desc",
  "theme_tags",
  "ranking_source_name",
  "ranking_source_url",
  "universe_source_name",
  "universe_source_url",
  "data_as_of",
  "universe_as_of",
  "universe_description",
  "universe_size",
  "metric_format",
  "notes",
] as const;

const ITEMS_COLUMNS = [
  "board_id",
  "row_type",
  "rank",
  "canonical_value",
  "aliases",
  "metric_value",
  "notes",
] as const;

function parseHeader(
  tsv: string,
  expected: readonly string[],
): { lines: string[]; sep: string } | null {
  const lines = tsv.replace(/\r/g, "").split("\n").filter(Boolean);
  const firstLine = lines.shift() ?? "";
  const sep = firstLine.includes("\t") ? "\t" : ",";
  const header = firstLine.split(sep);
  if (
    header.length !== expected.length ||
    expected.some((c, i) => header[i] !== c)
  )
    return null;
  return { lines, sep };
}

export function parseBoards(tsv: string): BoardsCsvRow[] | ImportError {
  const parsed = parseHeader(tsv, BOARDS_COLUMNS);
  if (!parsed)
    return {
      boardId: "",
      row: 1,
      column: "header",
      message: `Header must exactly match: ${BOARDS_COLUMNS.join(", ")}`,
    };
  return parsed.lines.map((line) => {
    const v = line.split(parsed.sep);
    const size = v[12] ? parseInt(v[12], 10) : undefined;
    return {
      boardId: v[0] ?? "",
      title: v[1] ?? "",
      prompt: v[2] ?? "",
      metricDesc: v[3] ?? "",
      themeTags: v[4] ?? "",
      rankingSourceName: v[5] ?? "",
      rankingSourceUrl: v[6] ?? "",
      universeSourceName: v[7] ?? "",
      universeSourceUrl: v[8] ?? "",
      dataAsOf: v[9] || undefined,
      universeAsOf: v[10] || undefined,
      universeDescription: v[11] || undefined,
      universeSize: size && !isNaN(size) ? size : undefined,
      metricFormat: MetricFormatSchema.safeParse(v[13]).success
        ? MetricFormatSchema.parse(v[13])
        : undefined,
      notes: v[14] || undefined,
    } satisfies BoardsCsvRow;
  });
}

export function parseItems(tsv: string): ItemsCsvRow[] | ImportError {
  const parsed = parseHeader(tsv, ITEMS_COLUMNS);
  if (!parsed)
    return {
      boardId: "",
      row: 1,
      column: "header",
      message: `Header must exactly match: ${ITEMS_COLUMNS.join(", ")}`,
    };
  return parsed.lines.map((line) => {
    const v = line.split(parsed.sep);
    const rank = v[2] ? parseInt(v[2], 10) : null;
    return {
      boardId: v[0] ?? "",
      rowType: (v[1] ?? "") as ItemsCsvRow["rowType"],
      rank: rank && !isNaN(rank) ? rank : null,
      canonicalValue: v[3] ?? "",
      aliases: v[4] ?? "",
      metricValue: v[5] || undefined,
      notes: v[6] || undefined,
    } satisfies ItemsCsvRow;
  });
}

export function combine(
  boardRows: BoardsCsvRow[],
  itemRows: ItemsCsvRow[],
): ParseResult {
  const itemsByBoard = new Map<string, ItemsCsvRow[]>();
  for (const item of itemRows) {
    const list = itemsByBoard.get(item.boardId) ?? [];
    list.push(item);
    itemsByBoard.set(item.boardId, list);
  }

  const validBoards: Board[] = [];
  const errors: ImportError[] = [];

  for (const [rowIndex, boardRow] of boardRows.entries()) {
    const csvRow = rowIndex + 2;
    const items = itemsByBoard.get(boardRow.boardId) ?? [];
    const top10 = items
      .filter((r) => r.rowType === "TOP10")
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const ref = items.find((r) => r.rowType === "UNIVERSE_REF");
    // Deduplicate by canonicalValue; TOP10 rows carry rank so prefer them.
    const universeByValue = new Map<string, ItemsCsvRow>();
    for (const r of items) {
      if (r.rowType === "UNIVERSE_REF") continue;
      if (!universeByValue.has(r.canonicalValue) || r.rowType === "TOP10")
        universeByValue.set(r.canonicalValue, r);
    }
    const universeItems = [...universeByValue.values()];

    if (top10.length < 10) {
      errors.push({
        boardId: boardRow.boardId,
        row: csvRow,
        column: "row_type",
        message: `Expected at least 10 TOP10 rows, got ${top10.length}`,
      });
      continue;
    }

    // Ties can produce > 10 TOP10 rows — take the first 10 by rank order.
    const ranked = top10.slice(0, 10).map((r) => r.canonicalValue);
    const universe = universeItems.map((r) => ({
      id: r.canonicalValue,
      label: r.canonicalValue,
      aliases: r.aliases ? r.aliases.split("|").filter(Boolean) : [],
      ...(r.metricValue ? { metricValue: r.metricValue } : {}),
      ...(r.rank != null ? { rank: r.rank } : {}),
    }));

    const refSize = ref?.metricValue
      ? parseInt(ref.metricValue, 10)
      : undefined;
    const universeSize =
      boardRow.universeSize ??
      (refSize && !isNaN(refSize) ? refSize : undefined);

    const board = {
      id: boardRow.boardId,
      version: 1,
      gameDay: null,
      title: boardRow.title,
      prompt: boardRow.prompt,
      metricDesc: boardRow.metricDesc,
      tags: boardRow.themeTags.split("|").filter(Boolean),
      rankingSource: {
        name: boardRow.rankingSourceName,
        url: boardRow.rankingSourceUrl,
      },
      universeSource: {
        name: boardRow.universeSourceName,
        url: boardRow.universeSourceUrl,
      },
      ...(boardRow.universeDescription
        ? { universeDescription: boardRow.universeDescription }
        : {}),
      ...(universeSize ? { universeSize } : {}),
      ...(boardRow.dataAsOf ? { dataAsOf: boardRow.dataAsOf } : {}),
      ...(boardRow.universeAsOf ? { universeAsOf: boardRow.universeAsOf } : {}),
      ...(boardRow.metricFormat ? { metricFormat: boardRow.metricFormat } : {}),
      universe,
      ranked,
    };

    const result = BoardSchema.safeParse(board);
    if (result.success) {
      validBoards.push(result.data);
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          boardId: boardRow.boardId,
          row: csvRow,
          column: issue.path.join("."),
          message: issue.message,
        });
      }
    }
  }

  return { validBoards, errors };
}
