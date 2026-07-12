import { useState } from "react";
import {
  parseBoards,
  parseItems,
  combine,
  type ParseResult,
  type ImportError,
} from "./parseClipboard";
import type { BoardsCsvRow, ItemsCsvRow } from "@daily/contracts";

const csrf = () =>
  document.cookie
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("d10_csrf="))
    ?.slice(9) ?? "";

const request = async (path: string, body?: unknown, method = "POST") => {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrf() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error ?? "Publisher request failed");
  return value;
};

export const overrideSchedule = (
  id: string,
  version: number,
  gameDay: string,
) =>
  request(`/v1/publisher/boards/${id}/${version}/schedule`, { gameDay }, "PUT");

function headerError(
  result: BoardsCsvRow[] | ItemsCsvRow[] | ImportError,
): ImportError | null {
  return !Array.isArray(result) ? result : null;
}

export function App() {
  const [boardsText, setBoardsText] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [preview, setPreview] = useState<ParseResult>({
    validBoards: [],
    errors: [],
  });
  const [states, setStates] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  const boardsResult = boardsText ? parseBoards(boardsText) : null;
  const itemsResult = itemsText ? parseItems(itemsText) : null;
  const boardsHeaderError = boardsResult ? headerError(boardsResult) : null;
  const itemsHeaderError = itemsResult ? headerError(itemsResult) : null;

  const canImport =
    Array.isArray(boardsResult) &&
    boardsResult.length > 0 &&
    Array.isArray(itemsResult) &&
    itemsResult.length > 0;

  const runImport = () => {
    if (!canImport) return;
    setPreview(
      combine(boardsResult as BoardsCsvRow[], itemsResult as ItemsCsvRow[]),
    );
  };

  const act = async (id: string, fn: () => Promise<any>) => {
    try {
      setError("");
      const value = await fn();
      setStates((s) => ({ ...s, [id]: value.state }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publisher action failed");
    }
  };

  return (
    <main>
      <h1>Board publisher</h1>

      <div style={{ display: "flex", gap: "1rem", flexDirection: "column" }}>
        <label>
          Boards CSV
          <textarea
            aria-label="Paste from d10net_boards.csv"
            value={boardsText}
            onChange={(e) => setBoardsText(e.target.value)}
            rows={6}
            style={{ display: "block", width: "100%", fontFamily: "monospace" }}
          />
        </label>
        {boardsHeaderError && (
          <p role="alert">Boards: {boardsHeaderError.message}</p>
        )}

        <label>
          Items CSV
          <textarea
            aria-label="Paste from d10net_items.csv"
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            rows={6}
            style={{ display: "block", width: "100%", fontFamily: "monospace" }}
          />
        </label>
        {itemsHeaderError && (
          <p role="alert">Items: {itemsHeaderError.message}</p>
        )}

        <button disabled={!canImport} onClick={runImport}>
          Validate &amp; Import
        </button>
      </div>

      {error && <p role="alert">{error}</p>}

      {preview.errors.map((e, i) => (
        <p role="alert" key={i}>
          Board {e.boardId || "import"}, row {e.row}, {e.column}: {e.message}
        </p>
      ))}

      {preview.validBoards.map((board) => {
        const day = dates[board.id] ?? board.gameDay ?? "";
        const state = states[board.id] ?? "Preview";
        const url = `/v1/publisher/boards/${board.id}/${board.version}`;
        const publish = () =>
          act(board.id, async () => {
            await request("/v1/publisher/boards", { ...board, gameDay: day });
            await request(`${url}/validate`);
            await overrideSchedule(board.id, board.version, day);
            return request(`${url}/publish`);
          });
        return (
          <section key={board.id}>
            <h2>{board.title}</h2>
            <p>
              {board.universe.length} candidates · {board.ranked.length} ranked
            </p>
            <label>
              Publish date{" "}
              <input
                type="date"
                value={day}
                onChange={(e) =>
                  setDates((d) => ({ ...d, [board.id]: e.target.value }))
                }
              />
            </label>
            <p>State: {state}</p>
            <button
              disabled={
                !day || preview.errors.some((e) => e.boardId === board.id)
              }
              onClick={() => void publish()}
            >
              Publish
            </button>
            <button
              onClick={() =>
                void act(board.id, () =>
                  request(url, { title: board.title }, "PATCH"),
                )
              }
            >
              Save edit
            </button>
            <button
              disabled={!day}
              onClick={() =>
                void act(board.id, () =>
                  overrideSchedule(board.id, board.version, day),
                )
              }
            >
              Override schedule
            </button>
            <button
              onClick={() =>
                void act(board.id, () => request(`${url}/correct`, board))
              }
            >
              Correct
            </button>
            <button
              onClick={() => void act(board.id, () => request(`${url}/retire`))}
            >
              Retire
            </button>
          </section>
        );
      })}
    </main>
  );
}
