import { useState } from "react";
import {
  parseBoards,
  parseItems,
  combine,
  type ParseResult,
  type ImportError,
} from "./parseClipboard";
import type { BoardsCsvRow, ItemsCsvRow } from "@daily/contracts";

let publisherKey = (() => {
  try {
    return sessionStorage.getItem("publisher_key") ?? "";
  } catch {
    return "";
  }
})();

const request = async (path: string, body?: unknown, method = "POST") => {
  const response = await fetch(path, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${publisherKey}`,
    },
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

function SignIn({ onKey }: { onKey: (key: string) => void }) {
  const [key, setKey] = useState("");
  return (
    <main>
      <h1>Publisher</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sessionStorage.setItem("publisher_key", key);
          publisherKey = key;
          onKey(key);
        }}
      >
        <label>
          Publisher key
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
        <button type="submit" style={{ marginTop: "0.5rem" }}>
          Sign in
        </button>
      </form>
    </main>
  );
}

export function App() {
  const [key, setKey] = useState(publisherKey);

  const [boardsText, setBoardsText] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [preview, setPreview] = useState<ParseResult>({
    validBoards: [],
    errors: [],
  });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  if (!key) return <SignIn onKey={setKey} />;

  const boardsResult = boardsText ? parseBoards(boardsText) : null;
  const itemsResult = itemsText ? parseItems(itemsText) : null;
  const boardsHeaderError = boardsResult ? headerError(boardsResult) : null;
  const itemsHeaderError = itemsResult ? headerError(itemsResult) : null;

  const canImport =
    Array.isArray(boardsResult) &&
    boardsResult.length > 0 &&
    Array.isArray(itemsResult) &&
    itemsResult.length > 0;

  const runImport = async () => {
    if (!canImport) return;
    const result = combine(
      boardsResult as BoardsCsvRow[],
      itemsResult as ItemsCsvRow[],
    );
    setPreview(result);
    if (result.validBoards.length === 0) return;
    setLoading(true);
    setStatus("");
    try {
      const res = await request(
        "/v1/publisher/boards/bulk",
        result.validBoards,
      );
      setStatus(`${res.count} board${res.count !== 1 ? "s" : ""} saved.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Import failed");
    } finally {
      setLoading(false);
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

        <button
          disabled={!canImport || loading}
          onClick={() => void runImport()}
        >
          {loading ? "Saving…" : "Validate & Import"}
        </button>
      </div>

      {status && <p role="status">{status}</p>}

      {preview.errors.map((e, i) => (
        <p role="alert" key={i}>
          Board {e.boardId || "import"}, row {e.row}, {e.column}: {e.message}
        </p>
      ))}

      {preview.validBoards.length > 0 && !status && (
        <p>
          {preview.validBoards.length} boards validated — click import to save.
        </p>
      )}
    </main>
  );
}
