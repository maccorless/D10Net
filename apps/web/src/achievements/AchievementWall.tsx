import { useEffect, useState } from "react";
import { loadAchievementState, type AchievementRecord } from "./store";

interface AchievementMeta {
  id: string;
  name: string;
  desc: string;
  tiered: boolean; // false = one-time unlock
}

const CATEGORIES: Array<{ label: string; ids: string[] }> = [
  {
    label: "Streak Milestones",
    ids: ["streak-7", "streak-30", "streak-100", "streak-365"],
  },
  {
    label: "Score Precision",
    ids: ["it-goes-to-11", "perfect-ten", "full-deck", "purist"],
  },
  {
    label: "The #1 Call",
    ids: ["called-it", "oracle"],
  },
  {
    label: "Score Windows",
    ids: ["week-score", "month-score"],
  },
  {
    label: "Speed",
    ids: ["fast-finish"],
  },
  {
    label: "Comeback",
    ids: ["phoenix"],
  },
];

const META: Record<string, AchievementMeta> = {
  "streak-7": {
    id: "streak-7",
    name: "First Week",
    desc: "7-day streak",
    tiered: false,
  },
  "streak-30": {
    id: "streak-30",
    name: "Month",
    desc: "30-day streak",
    tiered: false,
  },
  "streak-100": {
    id: "streak-100",
    name: "Century",
    desc: "100-day streak",
    tiered: false,
  },
  "streak-365": {
    id: "streak-365",
    name: "Year",
    desc: "365-day streak",
    tiered: false,
  },
  "it-goes-to-11": {
    id: "it-goes-to-11",
    name: "It Goes to 11",
    desc: "Score 11 points on a completed play",
    tiered: true,
  },
  "perfect-ten": {
    id: "perfect-ten",
    name: "Perfect Ten",
    desc: "Find all 10 answers",
    tiered: true,
  },
  "full-deck": {
    id: "full-deck",
    name: "Full Deck",
    desc: "All 10 found, no strikes",
    tiered: true,
  },
  purist: {
    id: "purist",
    name: "Purist",
    desc: "All 10 found with Hints Off",
    tiered: true,
  },
  "called-it": {
    id: "called-it",
    name: "Called It",
    desc: "Correct #1 call on a completed play",
    tiered: true,
  },
  oracle: {
    id: "oracle",
    name: "Oracle",
    desc: "Consecutive games with a correct #1 call",
    tiered: true,
  },
  "week-score": {
    id: "week-score",
    name: "Week Score",
    desc: "Points in any 7-day window (50 / 70 / 77)",
    tiered: true,
  },
  "month-score": {
    id: "month-score",
    name: "Month Score",
    desc: "Points in any 30-day window (100 / 200 / 300)",
    tiered: true,
  },
  "fast-finish": {
    id: "fast-finish",
    name: "Fast Finish",
    desc: "All 10 answers found fast (2 min / 1 min / 30 sec)",
    tiered: true,
  },
  phoenix: {
    id: "phoenix",
    name: "Phoenix",
    desc: "Returned after breaking a 30+ day streak",
    tiered: false,
  },
};

const STREAK_NODES = [7, 30, 100, 365];

const TIER_CLASS = ["", "bronze", "silver", "gold"] as const;

function TierPips({ record }: { record: AchievementRecord | undefined }) {
  const tier = record?.tier ?? 0;
  return (
    <div className="tier-pips">
      {([1, 10, 100] as const).map((label, i) => (
        <span
          key={label}
          className={`tier-pip${tier >= i + 1 ? ` ${TIER_CLASS[i + 1]}-earned` : ""}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function StreakTrack({ records }: { records: AchievementRecord[] }) {
  const earned = new Set(
    records.filter((r) => r.tier >= 3).map((r) => r.achievementId),
  );
  return (
    <div className="streak-track">
      {STREAK_NODES.map((n, i) => (
        <>
          <div className="streak-node" key={n}>
            <div
              className={`streak-dot${earned.has(`streak-${n}`) ? " earned" : ""}`}
            />
            <span className="streak-label">{n}</span>
          </div>
          {i < STREAK_NODES.length - 1 && (
            <div
              className={`streak-line${earned.has(`streak-${n}`) && earned.has(`streak-${STREAK_NODES[i + 1]}`) ? " filled" : ""}`}
            />
          )}
        </>
      ))}
    </div>
  );
}

function AchRow({
  meta,
  record,
}: {
  meta: AchievementMeta;
  record: AchievementRecord | undefined;
}) {
  const tier = record?.tier ?? 0;
  const locked = tier === 0 && !record;
  if (!meta.tiered) {
    // One-time unlock (streak milestones handled by track; phoenix shown as row)
    if (meta.id.startsWith("streak-")) return null;
    return (
      <div className={`ach-row${locked ? " locked" : ""}`}>
        <div className="ach-info">
          <div className="ach-name">{meta.name}</div>
          <div className="ach-desc">{meta.desc}</div>
        </div>
        <div className="ach-right">
          <span
            className="tier-pip"
            style={
              tier >= 3
                ? {
                    background: "var(--accent)",
                    borderColor: "var(--accent)",
                    color: "#fff",
                    opacity: 1,
                  }
                : undefined
            }
          >
            {tier >= 3 ? "Earned" : "—"}
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className={`ach-row${locked ? " locked" : ""}`}>
      <div className="ach-info">
        <div className="ach-name">{meta.name}</div>
        <div className="ach-desc">{meta.desc}</div>
        {record && record.count > 0 && (
          <div className="ach-progress">
            {record.count} time{record.count !== 1 ? "s" : ""}
          </div>
        )}
      </div>
      <div className="ach-right">
        <TierPips record={record} />
      </div>
    </div>
  );
}

export function AchievementWall() {
  const [records, setRecords] = useState<AchievementRecord[]>([]);

  useEffect(() => {
    loadAchievementState().then((s) => setRecords(s.records));
  }, []);

  const byId = Object.fromEntries(records.map((r) => [r.achievementId, r]));

  return (
    <div className="badge-shell">
      <div className="badge-header">
        <span className="badge-title">Achievements</span>
      </div>
      <div className="badge-content">
        {CATEGORIES.map(({ label, ids }) => (
          <div key={label}>
            <div className="badge-section-label">{label}</div>
            {label === "Streak Milestones" ? (
              <StreakTrack records={records} />
            ) : (
              ids.map((id) => {
                const meta = META[id];
                if (!meta) return null;
                return <AchRow key={id} meta={meta} record={byId[id]} />;
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
