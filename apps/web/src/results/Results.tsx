import { useEffect, useState } from "react";
import { buildShareText, shareResult, type ShareResult } from "./share";

export type ResultsProps = {
  result: ShareResult;
  streak: number;
  bestStreak: number;
  nextBoardAt: Date;
  missedAnswers?: string[];
};

export function Results({
  result,
  streak,
  bestStreak,
  nextBoardAt,
  missedAnswers = [],
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
        onClick={() => void shareResult(result)}
      >
        Share result
      </button>
      {missedAnswers.length > 0 && (
        <>
          <p className="results-missed-label">Not found</p>
          <ol className="results-missed">
            {missedAnswers.slice(0, shown).map((name) => (
              <li
                className={reduced ? "revealed-immediately" : "revealed"}
                key={name}
              >
                {name}
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="results-next">Next board in {countdown}</p>
    </section>
  );
}
