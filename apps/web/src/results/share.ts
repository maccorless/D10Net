export type ShareResult = {
  title: string;
  score: number;
  answersFound: number;
  hintMode: "on" | "off";
  hintUsed: boolean;
  strikes: number;
  elapsedMs: number;
};

export function buildShareText(r: ShareResult): string {
  const hint =
    r.hintMode === "off"
      ? "Hints Off"
      : `Hints On—${r.hintUsed ? "Used" : "Unused"}`;
  const grid =
    "🟩".repeat(Math.min(10, r.answersFound)) +
    "⬜".repeat(Math.max(0, 10 - r.answersFound));
  return (
    `${r.title}\n` +
    `${r.score} points · ${r.answersFound}/10 · ${hint}\n` +
    grid +
    (r.strikes ? `\n${"❌".repeat(r.strikes)}` : "") +
    (r.score === 11 && r.answersFound === 10 ? "\n🏆 It Goes to 11" : "")
  );
}

type ShareNavigator = {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
};

export async function shareResult(
  r: ShareResult,
  target: ShareNavigator = navigator,
): Promise<void> {
  const text = buildShareText(r);
  if (target.share) await target.share({ text });
  else if (target.clipboard) await target.clipboard.writeText(text);
  else throw new Error("Sharing is unavailable");
}
