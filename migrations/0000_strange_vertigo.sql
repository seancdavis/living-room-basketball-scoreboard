CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"multiplier" integer DEFAULT 1 NOT NULL,
	"multiplier_shots_remaining" integer DEFAULT 0 NOT NULL,
	"misses_remaining" integer DEFAULT 3 NOT NULL,
	"freebies_remaining" integer DEFAULT 0 NOT NULL,
	"mode" text DEFAULT 'multiplier' NOT NULL,
	"points_earned" integer DEFAULT 0,
	"previous_mode" text,
	"new_mode" text,
	"used_freebie" boolean DEFAULT false,
	"occurred_at" timestamp DEFAULT now() NOT NULL,
	"sequence_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"final_score" integer DEFAULT 0 NOT NULL,
	"high_multiplier" integer DEFAULT 1 NOT NULL,
	"total_makes" integer DEFAULT 0 NOT NULL,
	"total_misses" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"end_reason" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"total_games" integer DEFAULT 0 NOT NULL,
	"high_score" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer DEFAULT 600 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;