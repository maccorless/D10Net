import type { Board, HintMode, PlayResult } from "@daily/contracts";
import { createGame, deriveResult, submitGuess } from "@daily/game";

export type IssuedPlay = { id: string; startedAt: Date; hintMode: HintMode; gameDay: string };
export type VerifiedResult = ReturnType<typeof deriveResult> & { hintUsed: boolean; elapsedMs: number; acceptedAt: number; rankingEligible: boolean; anomaly?: string; hintMode: HintMode; gameDay: string };
export type Player = { id: string; latestGameDay?: string | null };
export type IssuedBoard = { id: string; version: number; gameDay: string; board: Board };
export type StartedPlay = IssuedPlay & { playerId: string; boardId: string; boardVersion: number; mode: "daily" | "archive"; boardGameDay: string; finished?: VerifiedResult };

/** Small authoritative repository contract; database implementations perform these calls in one transaction. */
export type PlayRepository = {
  findDaily(playerId: string, gameDay: string): Promise<StartedPlay | undefined>;
  findArchive(playerId: string, boardId: string, version: number): Promise<StartedPlay | undefined>;
  insert(play: StartedPlay): Promise<StartedPlay>;
  getForUpdate(id: string): Promise<StartedPlay | undefined>;
  board(id: string, version: number): Promise<Board | undefined>;
  complete(play: StartedPlay, result: VerifiedResult): Promise<StartedPlay>;
};

export async function startDaily(repo: PlayRepository, player: Player, issued: IssuedBoard, hintMode: HintMode, now: Date): Promise<StartedPlay> {
  const day = issued.gameDay;
  if (player.latestGameDay && day < player.latestGameDay) throw new Error("Time check failed: canonical day moved backwards");
  const existing = await repo.findDaily(player.id, day);
  if (existing) return existing;
  return repo.insert({ id: crypto.randomUUID(), playerId: player.id, boardId: issued.id, boardVersion: issued.version, boardGameDay: issued.gameDay, gameDay: day, mode: "daily", hintMode, startedAt: now });
}

export async function startArchive(repo: PlayRepository, player: Player, issued: IssuedBoard, hintMode: HintMode, now: Date): Promise<StartedPlay> {
  const existing = await repo.findArchive(player.id, issued.id, issued.version);
  if (existing) return existing;
  return repo.insert({ id: crypto.randomUUID(), playerId: player.id, boardId: issued.id, boardVersion: issued.version, boardGameDay: issued.gameDay, gameDay: canonicalUtcDay(now), mode: "archive", hintMode, startedAt: now });
}

const canonicalUtcDay = (date: Date) => date.toISOString().slice(0, 10);

export async function finishPlay(repo: PlayRepository, playerId: string, playId: string, submission: PlayResult, receivedAt = new Date()): Promise<StartedPlay> {
  const play = await repo.getForUpdate(playId);
  if (!play || play.playerId !== playerId) throw new Error("Play not found");
  if (play.finished) return play;
  const board = await repo.board(play.boardId, play.boardVersion);
  if (!board) throw new Error("Immutable board version not found");
  return repo.complete(play, verifySubmission(play, submission, board, receivedAt));
}

export function verifySubmission(play: IssuedPlay, submission: PlayResult, board: Board, receivedAt: Date, impossibleThreshold = { correct: 10, milliseconds: 5_000 }): VerifiedResult {
  if (submission.playId !== play.id) throw new Error("Play ID mismatch");
  if (submission.guesses.length > board.universe.length) throw new Error("Impossible guess count");
  if (new Set(submission.guesses.map(guess => guess.candidateId)).size !== submission.guesses.length) throw new Error("Candidate unavailable");
  let state = createGame(board, play.hintMode, { playId: play.id, startedAtMs: play.startedAt.getTime() });
  let previous = -1;
  for (const guess of submission.guesses) {
    if (guess.candidateId.length > 128) throw new Error("Candidate ID is too long");
    if (guess.atMs < previous) throw new Error("Guess timestamps must be monotonic");
    previous = guess.atMs;
    state = submitGuess(state, guess.candidateId, guess.calledNumberOne, guess.atMs);
  }
  const result = deriveResult(state);
  if (result.answersFound !== 10 && result.strikes !== 5) throw new Error("Game is not complete");
  if (play.hintMode === "off" && submission.hintUsed) throw new Error("Hint unavailable in Hints Off");
  const elapsedMs = Math.max(0, receivedAt.getTime() - play.startedAt.getTime());
  const anomalous = result.answersFound >= impossibleThreshold.correct && elapsedMs < impossibleThreshold.milliseconds;
  return { ...result, hintUsed: submission.hintUsed, elapsedMs, acceptedAt: receivedAt.getTime(), rankingEligible: !anomalous, anomaly: anomalous ? "impossible_time" : undefined, hintMode: play.hintMode, gameDay: play.gameDay };
}
