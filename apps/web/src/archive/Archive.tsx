export type ArchiveEntry = {
  gameDay: string; // YYYY-MM-DD
  status: "played-daily" | "played-archive" | "playable";
  result?: { score: number };
};

type Props = {
  entries: ArchiveEntry[];
  onPlay: (gameDay: string) => void;
  onReview: (gameDay: string) => void;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function groupByMonth(entries: ArchiveEntry[]): Map<string, ArchiveEntry[]> {
  const map = new Map<string, ArchiveEntry[]>();
  for (const entry of entries) {
    const monthKey = entry.gameDay.slice(0, 7);
    if (!map.has(monthKey)) map.set(monthKey, []);
    map.get(monthKey)!.push(entry);
  }
  return map;
}

function CalendarMonth({
  monthKey,
  entries,
  onPlay,
  onReview,
}: {
  monthKey: string;
  entries: ArchiveEntry[];
  onPlay: (d: string) => void;
  onReview: (d: string) => void;
}) {
  const [year, month] = monthKey.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDow = new Date(year, month - 1, 1).getDay();
  const entryMap = new Map(entries.map((e) => [e.gameDay, e]));

  const cells: (ArchiveEntry | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      const gameDay = `${monthKey}-${day}`;
      return entryMap.get(gameDay) ?? null;
    }),
  ];

  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;

  return (
    <section className="cal-month">
      <h2 className="cal-month-heading">{monthLabel}</h2>
      <div className="cal-grid">
        {DAY_NAMES.map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {cells.map((entry, idx) => {
          if (!entry)
            return <div key={`empty-${idx}`} className="cal-cell cal-empty" />;
          const dayNum = Number(entry.gameDay.slice(-2));
          const isPlayed =
            entry.status === "played-daily" ||
            entry.status === "played-archive";
          const label = isPlayed
            ? `Review ${MONTH_NAMES[month - 1]} ${dayNum}`
            : `Play ${MONTH_NAMES[month - 1]} ${dayNum}`;
          return (
            <div
              key={entry.gameDay}
              className="cal-cell"
              data-status={entry.status}
            >
              <button
                className={`cal-day-btn cal-day-btn--${entry.status}`}
                aria-label={label}
                onClick={() =>
                  isPlayed ? onReview(entry.gameDay) : onPlay(entry.gameDay)
                }
              >
                <span className="cal-day-num">{dayNum}</span>
                {isPlayed && entry.result && (
                  <span className="cal-day-score">{entry.result.score}pt</span>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Archive({ entries, onPlay, onReview }: Props) {
  const byMonth = groupByMonth(entries);
  const months = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));

  if (months.length === 0)
    return (
      <section>
        <p className="cal-empty-state">No archive entries yet.</p>
      </section>
    );

  return (
    <section aria-label="Archive">
      {months.map((monthKey) => (
        <CalendarMonth
          key={monthKey}
          monthKey={monthKey}
          entries={byMonth.get(monthKey)!}
          onPlay={onPlay}
          onReview={onReview}
        />
      ))}
    </section>
  );
}
