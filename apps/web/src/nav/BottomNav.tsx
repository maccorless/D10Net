export type NavCurrent = "today" | "archive" | "achievements";

export function BottomNav({ current }: { current: NavCurrent }) {
  return (
    <nav aria-label="Main navigation" className="bottom-nav">
      <button
        className={`nav-item${current === "today" ? " active" : ""}`}
        aria-current={current === "today" ? "page" : undefined}
        onClick={() => location.assign("/today")}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
        Today
      </button>
      <button
        className={`nav-item${current === "archive" ? " active" : ""}`}
        aria-current={current === "archive" ? "page" : undefined}
        onClick={() => location.assign("/archive")}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        Archive
      </button>
      <button
        className={`nav-item${current === "achievements" ? " active" : ""}`}
        aria-current={current === "achievements" ? "page" : undefined}
        onClick={() => location.assign("/achievements")}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" />
          <path d="M8.5 20 12 15l3.5 5M5 5H2M22 5h-3M5.5 2v3M18.5 2v3" />
        </svg>
        Achievements
      </button>
      <button className="nav-item" disabled aria-label="Profile (coming soon)">
        <svg
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
        Profile
      </button>
    </nav>
  );
}
