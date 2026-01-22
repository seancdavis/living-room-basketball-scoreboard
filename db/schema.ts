import { pgTable, text, integer, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

// Sessions table - groups multiple games together (10-minute sessions)
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Session stats (aggregated)
  totalGames: integer('total_games').notNull().default(0),
  highScore: integer('high_score').notNull().default(0),
  totalPoints: integer('total_points').notNull().default(0),

  // Duration
  durationSeconds: integer('duration_seconds').notNull().default(600), // Default 10 min

  // Timestamps
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Games table - each game is a unique record
export const games = pgTable('games', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Session info
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),

  // Game results
  finalScore: integer('final_score').notNull().default(0),
  highMultiplier: integer('high_multiplier').notNull().default(1),
  totalMakes: integer('total_makes').notNull().default(0),
  totalMisses: integer('total_misses').notNull().default(0),
  durationSeconds: integer('duration_seconds'), // How long the game lasted

  // Game outcome
  endReason: text('end_reason'), // 'out_of_misses', 'session_ended', 'manual_end'

  // Timestamps
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),

  // Metadata
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Events table - every action within a game
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  gameId: uuid('game_id').notNull().references(() => games.id, { onDelete: 'cascade' }),

  // Event type
  eventType: text('event_type').notNull(), // 'make', 'miss', 'mode_change', 'game_start', 'game_end'

  // State at time of event
  score: integer('score').notNull().default(0),
  multiplier: integer('multiplier').notNull().default(1),
  multiplierShotsRemaining: integer('multiplier_shots_remaining').notNull().default(0),
  missesRemaining: integer('misses_remaining').notNull().default(3),
  freebiesRemaining: integer('freebies_remaining').notNull().default(0),
  mode: text('mode').notNull().default('multiplier'), // 'multiplier' or 'point'

  // Points earned on this event (for makes)
  pointsEarned: integer('points_earned').default(0),

  // For mode changes
  previousMode: text('previous_mode'),
  newMode: text('new_mode'),

  // Was this a freebie miss?
  usedFreebie: boolean('used_freebie').default(false),

  // Timestamp
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),

  // Sequence number within the game (for ordering)
  sequenceNumber: integer('sequence_number').notNull(),
});

// Types for TypeScript
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
