import { z } from "zod";

export const HintModeSchema = z.enum(["on", "off"]);
export type HintMode = z.infer<typeof HintModeSchema>;

export const BoardSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    gameDay: z.string().date().nullable(),
    title: z.string().min(1),
    metric: z.string().min(1),
    tags: z.array(z.string()).min(1),
    sources: z
      .array(z.object({ name: z.string(), url: z.string().url() }))
      .min(1),
    universe: z
      .array(z.object({
        id: z.string(),
        label: z.string(),
        aliases: z.array(z.string()),
        metricValue: z.string().max(80).optional()
      }))
      .min(10),
    ranked: z.array(z.string()).length(10)
  })
  .superRefine((board, context) => {
    const universeIds = board.universe.map((candidate) => candidate.id);
    const ids = new Set(universeIds);

    if (ids.size !== universeIds.length) {
      context.addIssue({ code: "custom", message: "Duplicate universe candidate ID" });
    }
    if (new Set(board.ranked).size !== board.ranked.length) {
      context.addIssue({ code: "custom", message: "Duplicate ranked answer ID" });
    }

    for (const id of board.ranked) {
      if (!ids.has(id)) {
        context.addIssue({
          code: "custom",
          message: `Ranked answer ${id} is absent from universe`
        });
      }
      if (!board.universe.find((candidate) => candidate.id === id)?.metricValue) {
        context.addIssue({
          code: "custom",
          message: `Ranked answer ${id} requires a metric value`
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
  validationEnvelope: z.string()
});
export type PlayStart = z.infer<typeof PlayStartSchema>;

export const StartedGameSchema = z.object({ play: PlayStartSchema, board: BoardSchema }).superRefine(({ play, board }, context) => {
  if (play.boardId !== board.id || play.boardVersion !== board.version) context.addIssue({ code: "custom", message: "Started play and board must match" });
});
export type StartedGame = z.infer<typeof StartedGameSchema>;

export const GuessEventSchema = z.object({
  candidateId: z.string(),
  calledNumberOne: z.boolean(),
  atMs: z.number().int().nonnegative()
});
export type GuessEvent = z.infer<typeof GuessEventSchema>;

export const PlayResultSchema = z.object({
  playId: z.string().uuid(),
  guesses: z.array(GuessEventSchema),
  hintUsed: z.boolean(),
  finishedAt: z.string().datetime()
});
export type PlayResult = z.infer<typeof PlayResultSchema>;

export const BoardImportRowSchema = z.object({
  boardId: z.string().min(1),
  version: z.number().int().positive(),
  gameDay: z.string().date().nullable(),
  title: z.string().min(1),
  metric: z.string().min(1),
  tags: z.string().min(1),
  sourceName: z.string().min(1),
  sourceUrl: z.string().url(),
  candidateId: z.string().min(1),
  candidateLabel: z.string().min(1),
  aliases: z.string(),
  metricValue: z.string().max(80).optional(),
  rank: z.number().int().min(1).max(10).nullable()
});
export type BoardImportRow = z.infer<typeof BoardImportRowSchema>;
