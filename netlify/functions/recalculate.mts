import type { Context } from "@netlify/functions";
import { db, sessions, games, events } from "../../db";
import { eq, asc, desc } from "drizzle-orm";

/**
 * Recalculate endpoint - Rebuilds cached values on games and session from events
 *
 * POST /api/recalculate
 * Body: { sessionId: string }
 *
 * This endpoint:
 * 1. Fetches all games for the session
 * 2. For each game, fetches events and recalculates:
 *    - finalScore (from last event's score)
 *    - highMultiplier (max multiplier across all events)
 *    - totalMakes (count of 'make' events)
 *    - totalMisses (count of 'miss' events)
 *    - endedAt (from 'game_end' event timestamp, or last event if none)
 *    - isActive (false if there's a 'game_end' event or endReason is set)
 *    - durationSeconds (calculated from game start to end)
 * 3. Updates session aggregates:
 *    - totalGames (count of games)
 *    - totalPoints (sum of game final scores)
 *    - highScore (max final score across games)
 *    - endedAt (if session appears ended but missing timestamp)
 */

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return Response.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Fetch the session
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // Fetch all games for this session
    const sessionGames = await db.query.games.findMany({
      where: eq(games.sessionId, sessionId),
      orderBy: [asc(games.startedAt)],
    });

    const gameUpdates: Array<{ gameId: string; updates: Record<string, any> }> = [];
    let sessionTotalPoints = 0;
    let sessionHighScore = 0;
    let sessionTotalGames = 0;

    // Process each game
    for (const game of sessionGames) {
      // Fetch all events for this game
      const gameEvents = await db.query.events.findMany({
        where: eq(events.gameId, game.id),
        orderBy: [asc(events.sequenceNumber)],
      });

      if (gameEvents.length === 0) {
        // No events - skip this game but don't count it
        continue;
      }

      // Calculate values from events
      const lastEvent = gameEvents[gameEvents.length - 1];
      const gameStartEvent = gameEvents.find(e => e.eventType === 'game_start');
      const gameEndEvent = gameEvents.find(e => e.eventType === 'game_end');

      // Final score from last event's score
      const finalScore = lastEvent.score;

      // High multiplier is the max multiplier seen across all events
      const highMultiplier = Math.max(...gameEvents.map(e => e.multiplier));

      // Count makes and misses
      const totalMakes = gameEvents.filter(e => e.eventType === 'make').length;
      const totalMisses = gameEvents.filter(e => e.eventType === 'miss').length;

      // Determine if game has ended
      // Game is ended if: there's a game_end event, or endReason is set, or missesRemaining reached 0
      const hasGameEndEvent = !!gameEndEvent;
      const hasEndReason = !!game.endReason;
      const outOfMisses = lastEvent.missesRemaining <= 0 && lastEvent.eventType === 'miss' && !lastEvent.usedFreebie;
      const isGameEnded = hasGameEndEvent || hasEndReason || outOfMisses;

      // Calculate endedAt
      let endedAt: Date | null = null;
      if (isGameEnded) {
        if (gameEndEvent) {
          endedAt = new Date(gameEndEvent.occurredAt);
        } else {
          // Use the last event's timestamp as the end time
          endedAt = new Date(lastEvent.occurredAt);
        }
      }

      // Calculate duration if game has ended
      let durationSeconds: number | null = null;
      if (endedAt && game.startedAt) {
        durationSeconds = Math.floor((endedAt.getTime() - new Date(game.startedAt).getTime()) / 1000);
      }

      // Determine endReason if not set but game appears ended
      let endReason = game.endReason;
      if (isGameEnded && !endReason) {
        if (outOfMisses) {
          endReason = 'out_of_misses';
        } else if (hasGameEndEvent) {
          // Check if game_end event suggests session ended
          endReason = 'session_ended';
        }
      }

      // Build update object
      const updates: Record<string, any> = {
        finalScore,
        highMultiplier,
        totalMakes,
        totalMisses,
        isActive: !isGameEnded,
        // Also sync current state from last event
        currentScore: lastEvent.score,
        currentMultiplier: lastEvent.multiplier,
        currentMultiplierShotsRemaining: lastEvent.multiplierShotsRemaining,
        currentMisses: lastEvent.missesRemaining,
        currentFreebiesRemaining: lastEvent.freebiesRemaining,
        currentMode: lastEvent.mode,
      };

      if (endedAt) {
        updates.endedAt = endedAt;
      }
      if (durationSeconds !== null) {
        updates.durationSeconds = durationSeconds;
      }
      if (endReason) {
        updates.endReason = endReason;
      }

      gameUpdates.push({ gameId: game.id, updates });

      // Track session aggregates (only count completed games or games with events)
      sessionTotalGames++;
      sessionTotalPoints += finalScore;
      if (finalScore > sessionHighScore) {
        sessionHighScore = finalScore;
      }
    }

    // Apply all game updates
    for (const { gameId, updates } of gameUpdates) {
      await db.update(games)
        .set(updates)
        .where(eq(games.id, gameId));
    }

    // Determine session endedAt
    // Session is ended if: it has an endedAt, or time has elapsed, or all games are ended
    const allGamesEnded = sessionGames.length > 0 &&
      gameUpdates.every(gu => !gu.updates.isActive || gu.updates.isActive === false);

    // Check if session timer has expired
    const now = Date.now();
    const startedAtMs = new Date(session.startedAt).getTime();
    const durationMs = session.durationSeconds * 1000;
    const totalPausedMs = session.totalPausedMs || 0;

    let elapsedMs: number;
    if (session.isPaused && session.pausedAt) {
      elapsedMs = new Date(session.pausedAt).getTime() - startedAtMs - totalPausedMs;
    } else {
      elapsedMs = now - startedAtMs - totalPausedMs;
    }

    const timerExpired = elapsedMs >= durationMs;

    // Build session update
    const sessionUpdate: Record<string, any> = {
      totalGames: sessionTotalGames,
      totalPoints: sessionTotalPoints,
      highScore: sessionHighScore,
    };

    // Set endedAt if session appears ended but doesn't have one
    if (!session.endedAt && timerExpired) {
      // Calculate when session should have ended based on timer
      let endedAt: Date;
      if (session.isPaused && session.pausedAt) {
        // If paused when timer would have expired, end at the last game event
        const lastGameWithEvents = gameUpdates[gameUpdates.length - 1];
        if (lastGameWithEvents?.updates.endedAt) {
          endedAt = lastGameWithEvents.updates.endedAt;
        } else {
          endedAt = new Date(session.pausedAt);
        }
      } else {
        // End at the calculated expiration time
        endedAt = new Date(startedAtMs + durationMs + totalPausedMs);
      }
      sessionUpdate.endedAt = endedAt;
    }

    // Update currentGameId to the last active game, or null if all games ended
    const lastActiveGame = [...gameUpdates].reverse().find(gu => gu.updates.isActive !== false);
    if (lastActiveGame) {
      sessionUpdate.currentGameId = lastActiveGame.gameId;
    } else if (sessionGames.length > 0) {
      // All games ended - point to the last game but don't null it out
      // (so we can still see the last game state)
      sessionUpdate.currentGameId = sessionGames[sessionGames.length - 1].id;
    }

    // Apply session update
    const [updatedSession] = await db.update(sessions)
      .set(sessionUpdate)
      .where(eq(sessions.id, sessionId))
      .returning();

    // Fetch updated games
    const updatedGames = await db.query.games.findMany({
      where: eq(games.sessionId, sessionId),
      orderBy: [asc(games.startedAt)],
    });

    return Response.json({
      success: true,
      session: updatedSession,
      games: updatedGames,
      recalculated: {
        gamesProcessed: gameUpdates.length,
        totalGames: sessionTotalGames,
        totalPoints: sessionTotalPoints,
        highScore: sessionHighScore,
        sessionEnded: !!sessionUpdate.endedAt,
      },
    });
  } catch (error) {
    console.error("Error recalculating session:", error);
    return Response.json({ error: "Failed to recalculate session" }, { status: 500 });
  }
};

export const config = {
  path: '/api/recalculate'
};
