import { useCallback, useEffect, useMemo, useState } from "react";
import type { Board, PlayResult, PlayStart } from "@daily/contracts";
import {
  createGame,
  searchRemaining,
  submitGuess,
  useHint as revealHint,
  type GameState,
} from "@daily/game";

const DB_NAME = "daily-top-ten";
const DB_VERSION = 2;
let accessTokenProvider: () => string | undefined = () => undefined;

export function setAccessTokenProvider(provider: () => string | undefined) {
  accessTokenProvider = provider;
}

function requestHeaders() {
  const token = accessTokenProvider();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("games")) db.createObjectStore("games");
      if (!db.objectStoreNames.contains("finishQueue"))
        db.createObjectStore("finishQueue");
      if (!db.objectStoreNames.contains("issuedGames"))
        db.createObjectStore("issuedGames");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function read<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function write(
  store: string,
  key: string,
  value: unknown,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(store, "readwrite")
      .objectStore(store)
      .put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function remove(store: string, key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(store, "readwrite")
      .objectStore(store)
      .delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function queueFinishResult(result: PlayResult) {
  await write(
    "finishQueue",
    result.playId,
    Object.freeze(structuredClone(result)),
  );
}

export async function flushFinishQueue(
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const db = await openDb();
  const results = await new Promise<PlayResult[]>((resolve, reject) => {
    const request = db
      .transaction("finishQueue")
      .objectStore("finishQueue")
      .getAll();
    request.onsuccess = () => resolve(request.result as PlayResult[]);
    request.onerror = () => reject(request.error);
  });
  for (const result of results) {
    try {
      const response = await fetcher(`/v1/plays/${result.playId}/finish`, {
        method: "POST",
        credentials: "include",
        headers: requestHeaders(),
        body: JSON.stringify(result),
      });
      if (response.ok) await remove("finishQueue", result.playId);
    } catch {
      /* remains queued */
    }
  }
}

function formatElapsed(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export type GamePersistence = {
  load(playId: string): Promise<GameState | undefined>;
  save(playId: string, state: GameState): Promise<void> | void;
};
const indexedDbPersistence: GamePersistence = {
  load: (playId) => read<GameState>("games", playId),
  save: (playId, state) => write("games", playId, state),
};

export function useGame(
  board: Board,
  start: PlayStart,
  persistence: GamePersistence = indexedDbPersistence,
) {
  const initial = useMemo(
    () =>
      createGame(board, start.hintMode, {
        playId: start.playId,
        startedAtMs: new Date(start.startedAt).getTime(),
      }),
    [board, start.hintMode, start.playId, start.startedAt],
  );
  const [state, setState] = useState<GameState>(initial);
  const [restored, setRestored] = useState(false);
  const [callNumberOne, setCallNumberOne] = useState(false);
  const [lastWrongGuess, setLastWrongGuess] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let live = true;
    persistence
      .load(start.playId)
      .then((saved) => {
        if (
          live &&
          saved?.playId === start.playId &&
          saved.board.id === board.id &&
          saved.board.version === board.version
        )
          setState(saved);
      })
      .finally(() => live && setRestored(true));
    return () => {
      live = false;
    };
  }, [board.id, board.version, persistence, start.playId]);
  useEffect(() => {
    if (restored) void persistence.save(start.playId, state);
  }, [persistence, restored, start.playId, state]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    void flushFinishQueue();
    const flush = () => void flushFinishQueue();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  const submitSelected = useCallback(
    (candidateId: string) => {
      setLastWrongGuess(null);
      setState((current) => {
        const next = submitGuess(
          current,
          candidateId,
          callNumberOne,
          Math.max(0, Date.now() - current.startedAtMs),
        );
        if (next.strikes > current.strikes) setLastWrongGuess(candidateId);
        if (next.foundIds.length === 10 || next.strikes === 5) {
          const result: PlayResult = Object.freeze({
            playId: next.playId,
            guesses: [...next.guesses],
            hintUsed: next.hintUsed,
            finishedAt: new Date().toISOString(),
          });
          void queueFinishResult(result).then(() => flushFinishQueue());
        }
        return next;
      });
      setCallNumberOne(false);
    },
    [callNumberOne],
  );

  return {
    state,
    restoring: !restored,
    elapsed: formatElapsed(now - state.startedAtMs),
    search: (query: string) => searchRemaining(state, query),
    submitSelected,
    lastWrongGuess,
    callNumberOne,
    toggleCall: () => setCallNumberOne((value) => !value),
    useHint: (kind: "first-letter" | "metric-value") =>
      setState((current) => revealHint(current, kind)),
  };
}
