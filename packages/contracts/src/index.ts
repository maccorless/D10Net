import { z } from "zod";

export const HintModeSchema = z.enum(["on", "off"]);
export type HintMode = z.infer<typeof HintModeSchema>;

export const MetricFormatSchema = z.enum(["date_yyyymmdd"]);
export type MetricFormat = z.infer<typeof MetricFormatSchema>;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMetricValue(
  value: string,
  format?: MetricFormat,
): string {
  if (format === "date_yyyymmdd") {
    // Last 4 chars are MMDD; everything before is the year (handles years < 1000).
    const mmdd = value.slice(-4);
    const year = parseInt(value.slice(0, -4), 10);
    const month = parseInt(mmdd.slice(0, 2), 10);
    const day = parseInt(mmdd.slice(2), 10);
    const monthName = MONTHS[month - 1] ?? "";
    return `${monthName} ${day}, ${year}`;
  }
  return value;
}

export const BoardSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    gameDay: z.string().date().nullable(),
    title: z.string().min(1),
    prompt: z.string().min(1),
    metricDesc: z.string().min(1),
    tags: z.array(z.string()).min(1),
    rankingSource: z.object({ name: z.string(), url: z.string() }),
    universeSource: z.object({ name: z.string(), url: z.string() }),
    universeDescription: z.string().optional(),
    universeSize: z.number().int().positive().optional(),
    metricFormat: MetricFormatSchema.optional(),
    dataAsOf: z.string().optional(),
    universeAsOf: z.string().optional(),
    universe: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          aliases: z.array(z.string()),
          metricValue: z.string().max(80).optional(),
          rank: z.number().int().min(1).optional(),
        }),
      )
      .min(10),
    ranked: z.array(z.string()).length(10),
  })
  .superRefine((board, context) => {
    const universeIds = board.universe.map((candidate) => candidate.id);
    const ids = new Set(universeIds);

    if (ids.size !== universeIds.length) {
      context.addIssue({
        code: "custom",
        message: "Duplicate universe candidate ID",
      });
    }
    if (new Set(board.ranked).size !== board.ranked.length) {
      context.addIssue({
        code: "custom",
        message: "Duplicate ranked answer ID",
      });
    }

    for (const id of board.ranked) {
      if (!ids.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Ranked answer ${id} is absent from universe`,
        });
      }
      if (
        !board.universe.find((candidate) => candidate.id === id)?.metricValue
      ) {
        context.addIssue({
          code: "custom",
          message: `Ranked answer ${id} requires a metric value`,
        });
      }
    }
  });
export type Board = z.infer<typeof BoardSchema>;

export const PlayStartSchema = z.object({
  playId: z.string().uuid(),
  gameDay: z.string().date(),
  boardId: z.string(),
  boardVersion: z.number().int().positive(),
  startedAt: z.string().datetime(),
  mode: z.enum(["daily", "archive"]),
  hintMode: HintModeSchema,
  validationEnvelope: z.string(),
});
export type PlayStart = z.infer<typeof PlayStartSchema>;

export const StartedGameSchema = z
  .object({ play: PlayStartSchema, board: BoardSchema })
  .superRefine(({ play, board }, context) => {
    if (play.boardId !== board.id || play.boardVersion !== board.version)
      context.addIssue({
        code: "custom",
        message: "Started play and board must match",
      });
  });
export type StartedGame = z.infer<typeof StartedGameSchema>;

export const GuessEventSchema = z.object({
  candidateId: z.string(),
  calledNumberOne: z.boolean(),
  atMs: z.number().int().nonnegative(),
});
export type GuessEvent = z.infer<typeof GuessEventSchema>;

export const PlayResultSchema = z.object({
  playId: z.string().uuid(),
  guesses: z.array(GuessEventSchema),
  hintUsed: z.boolean(),
  finishedAt: z.string().datetime(),
});
export type PlayResult = z.infer<typeof PlayResultSchema>;

export const BoardsCsvRowSchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  metricDesc: z.string().min(1),
  themeTags: z.string(),
  rankingSourceName: z.string().min(1),
  rankingSourceUrl: z.string(),
  universeSourceName: z.string().min(1),
  universeSourceUrl: z.string(),
  dataAsOf: z.string().optional(),
  universeAsOf: z.string().optional(),
  universeDescription: z.string().optional(),
  universeSize: z.number().int().positive().optional(),
  metricFormat: MetricFormatSchema.optional(),
  notes: z.string().optional(),
});
export type BoardsCsvRow = z.infer<typeof BoardsCsvRowSchema>;

export const ItemsCsvRowSchema = z.object({
  boardId: z.string().min(1),
  rowType: z.enum(["TOP10", "UNIVERSE", "UNIVERSE_REF"]),
  rank: z.number().int().min(1).nullable(),
  canonicalValue: z.string().min(1),
  aliases: z.string(),
  metricValue: z.string().max(80).optional(),
  notes: z.string().optional(),
});
export type ItemsCsvRow = z.infer<typeof ItemsCsvRowSchema>;
