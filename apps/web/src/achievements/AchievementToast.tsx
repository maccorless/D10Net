import { useEffect, useState } from "react";

// ponytail: inline until Task 1 evaluator is merged — replace with import from @daily/game
export type AchievementUnlock = {
  achievementId: string;
  tier: 1 | 2 | 3;
  unlockedAt: string;
  playId: string;
};

const ACHIEVEMENT_LABELS: Record<string, { name: string; desc: string }> = {
  "it-goes-to-11": { name: "It Goes to 11", desc: "Scored 11 points" },
  "perfect-ten": { name: "Perfect Ten", desc: "Found all 10 answers" },
  "full-deck": { name: "Full Deck", desc: "No strikes used" },
  purist: { name: "Purist", desc: "Perfect with Hints Off" },
  "called-it": { name: "Called It", desc: "Correctly called #1" },
  oracle: { name: "Oracle", desc: "Consecutive #1 calls" },
  "week-score": { name: "Week Score", desc: "Points in 7-day window" },
  "month-score": { name: "Month Score", desc: "Points in 30-day window" },
  "fast-finish": { name: "Fast Finish", desc: "Lightning-fast perfect game" },
  phoenix: { name: "Phoenix", desc: "Returned after a long break" },
  "streak-7": { name: "First Week", desc: "7-day streak" },
  "streak-30": { name: "Month", desc: "30-day streak" },
  "streak-100": { name: "Century", desc: "100-day streak" },
  "streak-365": { name: "Year", desc: "365-day streak" },
};

const TIER_LABEL = ["", "Bronze", "Silver", "Gold"] as const;
const TIER_CLASS = ["", "bronze", "silver", "gold"] as const;

type Props = {
  unlocks: AchievementUnlock[];
  onDone?: () => void;
};

export function AchievementToast({ unlocks, onDone }: Props) {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"entering" | "exiting">("entering");

  const advance = () => {
    setPhase("exiting");
    setTimeout(() => {
      const next = index + 1;
      if (next >= unlocks.length) {
        onDone?.();
      } else {
        setIndex(next);
        setPhase("entering");
      }
    }, 240);
  };

  useEffect(() => {
    if (unlocks.length === 0) return;
    setPhase("entering");
    const id = setTimeout(advance, 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, unlocks.length]);

  if (unlocks.length === 0) return null;

  const unlock = unlocks[index];
  if (!unlock) return null;

  const label = ACHIEVEMENT_LABELS[unlock.achievementId] ?? {
    name: unlock.achievementId,
    desc: "",
  };
  const tierClass = TIER_CLASS[unlock.tier];
  const tierLabel = TIER_LABEL[unlock.tier];
  const tierInitial = tierLabel[0];

  return (
    <div className="toast-region">
      <div
        className={`toast ${phase === "entering" ? "toast-entering" : "toast-exiting"}`}
      >
        <div className={`toast-tier-dot ${tierClass}`}>{tierInitial}</div>
        <div className="toast-body">
          <div className="toast-name">{label.name}</div>
          <div className="toast-sub">
            {tierLabel} · {label.desc}
          </div>
        </div>
        <button
          className="toast-dismiss"
          onClick={advance}
          aria-label="Dismiss"
        >
          ×
        </button>
        <div className="toast-bar-track">
          <div
            className={`toast-bar ${tierClass}`}
            style={{ animation: `toast-drain 4000ms linear forwards` }}
          />
        </div>
      </div>
    </div>
  );
}
