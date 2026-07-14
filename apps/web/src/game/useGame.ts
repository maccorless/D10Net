import { useCallback, useEffect, useMemo, useState } from "react";
import type { Board, PlayResult, PlayStart } from "@daily/contracts";
import {
  createGame,
  searchRemaining,
  submitGuess,
  useHint as revealHint,
  type GameState,
} from "@daily/game";
import { read, write, remove, getAll } from "../db";

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
  const results = await getAll<PlayResult>("finishQueue");
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
