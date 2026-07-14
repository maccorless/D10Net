import { useEffect, useState } from "react";
import { buildShareText, shareResult, type ShareResult } from "./share";

export type ResultsProps = {
  result: ShareResult;
  streak: number;
  bestStreak: number;
  nextBoardAt: Date;
  missedAnswers?: { label: string; rank: number }[];
  wrongGuesses?: { label: string; rank: number | null }[];
  foundInOrder?: { label: string; rank: number }[];
};

export function Results({
  result,
  streak,
  bestStreak,
  nextBoardAt,
  missedAnswers = [],
  wrongGuesses = [],
  foundInOrder = [],
}: ResultsProps) {
  const reduced =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduced ? missedAnswers.length : 0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (reduced || shown >= missedAnswers.length) return;
    const id = setTimeout(() => setShown((n) => n + 1), 200);
    return () => clearTimeout(id);
  }, [reduced, shown, missedAnswers.length]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const hintLine =
    result.hintMode === "off"
      ? "Hints Off"
      : result.hintUsed
        ? "Hints On — Used"
        : "Hints On — Unused";

  const msLeft = Math.max(0, nextBoardAt.getTime() - now);
  const h = Math.floor(msLeft / 3_600_000);
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  const s = Math.floor((msLeft % 60_000) / 1000);
  const countdown = h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`;

  return (
    <section aria-label="Results">
      <p className="results-score">{result.score} points</p>
      <p className="results-meta">
        {result.answersFound}/10 found
        {result.strikes > 0 && ` · ${"❌".repeat(result.strikes)}`}
      </p>
      <p className="results-meta">{hintLine}</p>
      {streak > 0 && (
        <p className="results-streak">
          Streak {streak} · Best {bestStreak}
        </p>
      )}
      <pre className="results-grid">{buildShareText(result)}</pre>
      <button
        className="results-share"
        onClick={() =>
          shareResult(result).catch((e: unknown) => {
            if (e instanceof Error && e.name !== "AbortError") throw e;
          })
        }
      >
        Share result
      </button>

      {foundInOrder.length > 0 && (
        <>
          <p className="results-section-label">Found</p>
          <ul className="results-found">
            {foundInOrder.map(({ label, rank }) => (
              <li className="results-found-item" key={label}>
                <span className="results-wrong-rank">#{rank}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {wrongGuesses.length > 0 && (
        <>
          <p className="results-section-label">Wrong guesses</p>
          <ul className="results-wrong">
            {wrongGuesses.map(({ label, rank }) => (
              <li className="results-wrong-item" key={label}>
                <span>{label}</span>
                <span className="results-wrong-rank">
                  {rank != null ? `#${rank}` : "Not in top 10"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {missedAnswers.length > 0 && (
        <>
          <p className="results-missed-label">Not found</p>
          <ul className="results-missed">
            {missedAnswers.slice(0, shown).map(({ label, rank }) => (
              <li
                className={reduced ? "revealed-immediately" : "revealed"}
                key={label}
              >
                <span className="results-wrong-rank">#{rank}</span>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="results-next">Next board in {countdown}</p>
    </section>
  );
}
