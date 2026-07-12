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

function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await fetch("/v1/auth/magic-link", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: location.origin,
        },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError("Could not send sign-in link. Check your connection.");
    }
  };

  if (sent)
    return (
      <main>
        <h1>Check your email</h1>
        <p>A sign-in link was sent to {email}. Click it to continue.</p>
      </main>
    );

  return (
    <main>
      <h1>Publisher sign in</h1>
      <form onSubmit={(e) => void submit(e)}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", marginTop: "0.25rem" }}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" style={{ marginTop: "0.5rem" }}>
          Send sign-in link
        </button>
      </form>
    </main>
  );
}

export function App() {
  const isSignedIn = !!csrf();

  const [boardsText, setBoardsText] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [preview, setPreview] = useState<ParseResult>({
    validBoards: [],
    errors: [],
  });
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isSignedIn) return <SignIn />;

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
