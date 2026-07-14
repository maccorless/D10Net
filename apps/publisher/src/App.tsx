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
    return localStorage.getItem("publisher_key") ?? "";
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
  const text = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = {};
  }
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("publisher_key");
    publisherKey = "";
    location.reload();
    throw Error("Session expired");
  }
  if (!response.ok)
    throw Error(
      (value as Record<string, string>).error ??
        `Server error ${response.status}`,
    );
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
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/v1/publisher/ping", {
        headers: { authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        setError("Invalid publisher key.");
        return;
      }
      localStorage.setItem("publisher_key", key);
      publisherKey = key;
      onKey(key);
    } catch {
      setError("Could not reach server.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <main>
      <h1>Publisher</h1>
      <form onSubmit={(e) => void submit(e)}>
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
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          disabled={checking}
          style={{ marginTop: "0.5rem" }}
        >
          {checking ? "Checking…" : "Sign in"}
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
  const [deleteFirst, setDeleteFirst] = useState(false);

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
      if (deleteFirst)
        await request("/v1/publisher/boards", undefined, "DELETE");
      const res = (await request(
        "/v1/publisher/boards/bulk",
        result.validBoards,
      )) as { count: number };
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
        <label htmlFor="boards-csv">
          Boards CSV
          <textarea
            id="boards-csv"
            value={boardsText}
            onChange={(e) => setBoardsText(e.target.value)}
            rows={6}
            style={{ display: "block", width: "100%", fontFamily: "monospace" }}
          />
        </label>
        {boardsHeaderError && (
          <p role="alert">Boards: {boardsHeaderError.message}</p>
        )}

        <label htmlFor="items-csv">
          Items CSV
          <textarea
            id="items-csv"
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            rows={6}
            style={{ display: "block", width: "100%", fontFamily: "monospace" }}
          />
        </label>
        {itemsHeaderError && (
          <p role="alert">Items: {itemsHeaderError.message}</p>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={deleteFirst}
            onChange={(e) => setDeleteFirst(e.target.checked)}
          />
          Delete all existing board data before import
        </label>

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
