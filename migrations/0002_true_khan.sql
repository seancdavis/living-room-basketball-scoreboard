ALTER TABLE "games" ADD COLUMN "current_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "current_multiplier" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "current_multiplier_shots_remaining" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "current_misses" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "current_freebies_remaining" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "current_mode" text DEFAULT 'multiplier' NOT NULL;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "paused_at" timestamp;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "total_paused_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "current_game_id" uuid;