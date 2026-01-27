import type { Context } from "@netlify/functions";
import { db, games, events, sessions } from "../../db";
import { eq, sql } from "drizzle-orm";

export default async (req: Request, context: Context) => {
  const method = req.method;

  // POST - Create a new game
  if (method === "POST") {
    try {
      const body = await req.json();
      const { sessionId } = body;

      if (!sessionId) {
        return Response.json({ error: "sessionId is required" }, { status: 400 });
      }

      const [game] = await db.insert(games).values({
        sessionId,
      }).returning();

      // Set this as the current game on the session
      await db.update(sessions)
        .set({ currentGameId: game.id })
        .where(eq(sessions.id, sessionId));

      // Create the game_start event
      await db.insert(events).values({
        gameId: game.id,
        eventType: 'game_start',
        score: 0,
        multiplier: 1,
        multiplierShotsRemaining: 0,
        missesRemaining: 3,
        freebiesRemaining: 0,
        mode: 'multiplier',
        sequenceNumber: 0,
      });

      return Response.json({ game });
    } catch (error) {
      console.error("Error creating game:", error);
      return Response.json({ error: "Failed to create game" }, { status: 500 });
    }
  }

  // PUT - Update/end a game or update current game state
  if (method === "PUT") {
    try {
      const body = await req.json();
      const {
        gameId,
        // Current state fields (for live updates)
        currentScore,
        currentMultiplier,
        currentMultiplierShotsRemaining,
        currentMisses,
        currentFreebiesRemaining,
        currentMode,
        // Final stats (for game ending)
        finalScore,
        highMultiplier,
        totalMakes,
        totalMisses,
        durationSeconds,
        endReason,
        ended, // Flag to indicate game is ending
      } = body;

      if (!gameId) {
        return Response.json({ error: "gameId is required" }, { status: 400 });
      }

      // Build update object dynamically
      const updateData: Record<string, any> = {};

      // Current state updates
      if (currentScore !== undefined) updateData.currentScore = currentScore;
      if (currentMultiplier !== undefined) updateData.currentMultiplier = currentMultiplier;
      if (currentMultiplierShotsRemaining !== undefined) updateData.currentMultiplierShotsRemaining = currentMultiplierShotsRemaining;
      if (currentMisses !== undefined) updateData.currentMisses = currentMisses;
      if (currentFreebiesRemaining !== undefined) updateData.currentFreebiesRemaining = currentFreebiesRemaining;
      if (currentMode !== undefined) updateData.currentMode = currentMode;

      // Final stats updates
      if (finalScore !== undefined) updateData.finalScore = finalScore;
      if (highMultiplier !== undefined) updateData.highMultiplier = highMultiplier;
      if (totalMakes !== undefined) updateData.totalMakes = totalMakes;
      if (totalMisses !== undefined) updateData.totalMisses = totalMisses;
      if (durationSeconds !== undefined) updateData.durationSeconds = durationSeconds;
      if (endReason !== undefined) updateData.endReason = endReason;

      // If ending the game
      if (ended) {
        updateData.endedAt = new Date();
        updateData.isActive = false;
      }

      const [game] = await db.update(games)
        .set(updateData)
        .where(eq(games.id, gameId))
        .returning();

      // If ending the game, update session stats and clear currentGameId
      if (ended && game) {
        await db.update(sessions)
          .set({
            totalGames: sql`${sessions.totalGames} + 1`,
            totalPoints: sql`${sessions.totalPoints} + ${finalScore || 0}`,
            highScore: sql`GREATEST(${sessions.highScore}, ${finalScore || 0})`,
            currentGameId: null,
          })
          .where(eq(sessions.id, game.sessionId));
      }

      return Response.json({ game });
    } catch (error) {
      console.error("Error updating game:", error);
      return Response.json({ error: "Failed to update game" }, { status: 500 });
    }
  }

  // GET - Get game details with events
  if (method === "GET") {
    try {
      const url = new URL(req.url);
      const gameId = url.searchParams.get("id");

      if (!gameId) {
        return Response.json({ error: "Game ID is required" }, { status: 400 });
      }

      const game = await db.query.games.findFirst({
        where: eq(games.id, gameId),
      });

      if (!game) {
        return Response.json({ error: "Game not found" }, { status: 404 });
      }

      const gameEvents = await db.query.events.findMany({
        where: eq(events.gameId, gameId),
        orderBy: (events, { asc }) => [asc(events.sequenceNumber)],
      });

      return Response.json({ game, events: gameEvents });
    } catch (error) {
      console.error("Error fetching game:", error);
      return Response.json({ error: "Failed to fetch game" }, { status: 500 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
