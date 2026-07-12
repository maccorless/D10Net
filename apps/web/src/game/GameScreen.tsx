import type { Board, PlayStart } from "@daily/contracts";
import { SearchPicker } from "./SearchPicker";
import { useGame, type GamePersistence } from "./useGame";
import { deriveResult, getGuessRank } from "@daily/game";

type Props = { board: Board; start: PlayStart; persistence?: GamePersistence };

function StrikeMeter({ strikes }: { strikes: number }) {
  return (
    <span className="strikes" role="img" aria-label={`${strikes} of 5 strikes`}>
      {Array.from({ length: 5 }, (_, index) => (
        <i className={index < strikes ? "filled" : ""} key={index} />
      ))}
    </span>
  );
}

export function GameScreen({ board, start, persistence }: Props) {
  const game = useGame(board, start, persistence);
  if (game.restoring)
    return (
      <main className="game-shell">
        <p role="status" className="loading">
          Restoring your game…
        </p>
      </main>
    );
  if (game.state.foundIds.length === 10 || game.state.strikes === 5) {
    const result = deriveResult(game.state);
    return (
      <main className="game-shell results-shell" aria-label="Results">
        <h1>{result.score} points</h1>
        <p>{result.answersFound}/10</p>
        <p>{start.hintMode === "off" ? "Hints Off" : "Hints On"}</p>
      </main>
    );
  }
  return (
    <main className="game-shell">
      <header>
        <span>DAILY · {board.tags[0]!.toUpperCase()}</span>
        <time
          dateTime={`PT${Math.floor((Date.now() - game.state.startedAtMs) / 1000)}S`}
        >
          {game.elapsed}
        </time>
      </header>
      <h1>{board.prompt}</h1>
      <p className="metric">{board.metricDesc}</p>
      <p className="instructions">
        Find the top 10. Five wrong guesses ends it.
      </p>
      <div className="status">
        <strong>{game.state.foundIds.length} / 10</strong>
        <StrikeMeter strikes={game.state.strikes} />
      </div>
      <ol className="rank-grid">
        {board.ranked.map((id, rank) => {
          const found = game.state.foundIds.includes(id);
          const candidate = board.universe.find((item) => item.id === id);
          const hint =
            game.state.hintReveal?.rank === rank + 1
              ? ` · ${game.state.hintReveal.value}${game.state.hintReveal.kind === "first-letter" ? "…" : ""}`
              : "";
          return (
            <li
              data-testid="rank-slot"
              className={found ? "found" : ""}
              key={id}
            >
              <b>{rank + 1}</b>
              <span>{found ? candidate?.label : `?${hint}`}</span>
            </li>
          );
        })}
      </ol>
      {game.lastWrongGuess &&
        (() => {
          const rank = getGuessRank(game.lastWrongGuess, board);
          if (rank == null)
            return <p className="wrong-feedback">Not in the top 10.</p>;
          const tied = board.universe.filter((c) => c.rank === rank).length > 1;
          return (
            <p className="wrong-feedback">
              {tied ? `Tied for #${rank}.` : `That was #${rank}.`}
            </p>
          );
        })()}
      <div className="controls">
        <SearchPicker
          search={game.search}
          onSelect={game.submitSelected}
          armed={game.callNumberOne}
        />
        {!game.state.numberOneCallUsed && (
          <button
            className={`call ${game.callNumberOne ? "armed" : ""}`}
            aria-pressed={game.callNumberOne}
            onClick={game.toggleCall}
          >
            ⓵ {game.callNumberOne ? "Submit next as #1 (+1)" : "Call #1 (+1)"}
          </button>
        )}
        {game.state.hintMode === "on" && !game.state.hintUsed && (
          <div className="hint">
            <span>Free hint (1×):</span>
            <button onClick={() => game.useHint("first-letter")}>
              First letter
            </button>
            <button onClick={() => game.useHint("metric-value")}>
              Metric value
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
