CREATE TABLE "achievement_unlocks" (
	"player_id" uuid NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_unlocks_player_id_achievement_id_pk" PRIMARY KEY("player_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid,
	"play_id" uuid,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "board_versions" (
	"board_id" text NOT NULL,
	"version" integer NOT NULL,
	"game_day" date,
	"payload" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	CONSTRAINT "board_versions_board_id_version_pk" PRIMARY KEY("board_id","version")
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latest_game_day" date
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"board_id" text NOT NULL,
	"board_version" integer NOT NULL,
	"game_day" date NOT NULL,
	"board_game_day" date,
	"played_at" timestamp with time zone NOT NULL,
	"mode" text NOT NULL,
	"hint_mode" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"score" integer,
	"elapsed_ms" integer,
	"authoritative_result" jsonb,
	"ranking_eligible" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_assignments" (
	"game_day" date PRIMARY KEY NOT NULL,
	"board_id" text NOT NULL,
	"board_version" integer NOT NULL,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"player_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "streaks" (
	"player_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"current" integer DEFAULT 0 NOT NULL,
	"best" integer DEFAULT 0 NOT NULL,
	"last_game_day" date,
	CONSTRAINT "streaks_player_id_kind_pk" PRIMARY KEY("player_id","kind")
);
--> statement-breakpoint
ALTER TABLE "achievement_unlocks" ADD CONSTRAINT "achievement_unlocks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_versions" ADD CONSTRAINT "board_versions_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_board_id_board_version_board_versions_board_id_version_fk" FOREIGN KEY ("board_id","board_version") REFERENCES "public"."board_versions"("board_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_board_id_board_version_board_versions_board_id_version_fk" FOREIGN KEY ("board_id","board_version") REFERENCES "public"."board_versions"("board_id","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streaks" ADD CONSTRAINT "streaks_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_daily_per_player_day" ON "plays" USING btree ("player_id","game_day","mode") WHERE "plays"."mode" = 'daily';--> statement-breakpoint
CREATE UNIQUE INDEX "one_archive_per_player_board" ON "plays" USING btree ("player_id","board_id","board_version") WHERE "plays"."mode" = 'archive';--> statement-breakpoint
CREATE INDEX "ranking_day_pool" ON "plays" USING btree ("game_day","hint_mode","ranking_eligible");
--> statement-breakpoint
CREATE TABLE "accounts" ("id" uuid PRIMARY KEY, "email" text NOT NULL UNIQUE, "player_id" uuid NOT NULL UNIQUE REFERENCES "players"("id"));
--> statement-breakpoint
CREATE TABLE "account_sessions" ("id" uuid PRIMARY KEY, "account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE cascade, "token_hash" text NOT NULL UNIQUE, "expires_at" timestamp with time zone NOT NULL);
--> statement-breakpoint
CREATE TABLE "guest_credentials" ("player_id" uuid PRIMARY KEY REFERENCES "players"("id") ON DELETE cascade, "token_hash" text NOT NULL UNIQUE, "revoked_at" timestamp with time zone, "merged_account_id" uuid REFERENCES "accounts"("id"), "prior_account_token_hash" text, "merge_receipt_expires_at" timestamp with time zone);
--> statement-breakpoint
CREATE TABLE "magic_links" ("id" uuid PRIMARY KEY, "email" text NOT NULL, "token_hash" text NOT NULL UNIQUE, "expires_at" timestamp with time zone NOT NULL, "consumed_at" timestamp with time zone);
