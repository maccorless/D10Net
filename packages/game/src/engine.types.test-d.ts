import type { Board } from "@daily/contracts";
import { createGame, submitGuess, useHint } from "./engine.js";

declare const board: Board;

// @ts-expect-error initialization seed and time are required
createGame(board, "off");

const state = createGame(board, "on", { playId: "play", startedAtMs: 0 });

// @ts-expect-error explicit event time is required
submitGuess(state, "candidate", false);

// @ts-expect-error explicit hint kind is required
useHint(state);
