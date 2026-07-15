const KEY = "d10_play_history";

export function getPlayHistory(): Record<string, "daily" | "archive"> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      "daily" | "archive"
    >;
  } catch {
    return {};
  }
}

export function recordPlay(gameDay: string, mode: "daily" | "archive"): void {
  try {
    const history = getPlayHistory();
    // ponytail: daily always wins — never downgrade a daily record to archive
    if (history[gameDay] === "daily") return;
    history[gameDay] = mode;
    localStorage.setItem(KEY, JSON.stringify(history));
  } catch {
    /* storage unavailable */
  }
}
