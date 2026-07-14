const STORAGE_KEY = "d10net:play-log";

type StartEntry = {
  event: "start";
  ts: string;
  boardId: string;
  title: string;
};

type EndEntry = {
  event: "end";
  ts: string;
  boardId: string;
  title: string;
  score: number;
  misses: number;
};

export type PlayLogEntry = StartEntry | EndEntry;

function getLog(): PlayLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function append(entry: PlayLogEntry) {
  const log = getLog();
  log.push(entry);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
}

export function logGameStart(boardId: string, title: string) {
  append({ event: "start", ts: new Date().toISOString(), boardId, title });
}

export function logGameEnd(
  boardId: string,
  title: string,
  score: number,
  misses: number,
) {
  append({
    event: "end",
    ts: new Date().toISOString(),
    boardId,
    title,
    score,
    misses,
  });
}
