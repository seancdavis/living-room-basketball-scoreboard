import type { Context } from "@netlify/functions";
import { db, sessions, games } from "../../db";
import { eq, desc } from "drizzle-orm";

export default async (req: Request, context: Context) => {
  const method = req.method;

  // POST - Create a new session
  if (method === "POST") {
    try {
      const body = await req.json();
      const { durationSeconds = 600 } = body;

      const [session] = await db.insert(sessions).values({
        durationSeconds,
      }).returning();

      return Response.json({ session });
    } catch (error) {
      console.error("Error creating session:", error);
      return Response.json({ error: "Failed to create session" }, { status: 500 });
    }
  }

  // PUT - Update/end a session
  if (method === "PUT") {
    try {
      const body = await req.json();
      const {
        sessionId,
        highScore,
        totalGames,
        totalPoints,
        isPaused,
        pausedAt,
        totalPausedMs,
        currentGameId,
        ended,
      } = body;

      if (!sessionId) {
        return Response.json({ error: "sessionId is required" }, { status: 400 });
      }

      // Build update object dynamically based on provided fields
      const updateData: Record<string, any> = {};

      if (highScore !== undefined) updateData.highScore = highScore;
      if (totalGames !== undefined) updateData.totalGames = totalGames;
      if (totalPoints !== undefined) updateData.totalPoints = totalPoints;
      if (isPaused !== undefined) updateData.isPaused = isPaused;
      if (pausedAt !== undefined) updateData.pausedAt = pausedAt ? new Date(pausedAt) : null;
      if (totalPausedMs !== undefined) updateData.totalPausedMs = totalPausedMs;
      if (currentGameId !== undefined) updateData.currentGameId = currentGameId;
      if (ended) updateData.endedAt = new Date();

      const [session] = await db.update(sessions)
        .set(updateData)
        .where(eq(sessions.id, sessionId))
        .returning();

      return Response.json({ session });
    } catch (error) {
      console.error("Error updating session:", error);
      return Response.json({ error: "Failed to update session" }, { status: 500 });
    }
  }

  // GET - Get session(s)
  // With id param: get single session with games
  // Without id param: get all sessions (most recent first)
  if (method === "GET") {
    try {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get("id");

      // If no ID, return all sessions
      if (!sessionId) {
        const allSessions = await db.query.sessions.findMany({
          orderBy: [desc(sessions.startedAt)],
        });
        return Response.json({ sessions: allSessions });
      }

      // Get single session with games
      let session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });

      if (!session) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      // Check if session should be auto-ended (timer expired while user was away)
      if (!session.endedAt) {
        const now = Date.now();
        const startedAtMs = new Date(session.startedAt).getTime();
        const durationMs = session.durationSeconds * 1000;
        const totalPausedMs = session.totalPausedMs || 0;

        // Calculate elapsed time
        let elapsedMs: number;
        if (session.isPaused && session.pausedAt) {
          // If paused, calculate elapsed up to pause time
          elapsedMs = new Date(session.pausedAt).getTime() - startedAtMs - totalPausedMs;
        } else {
          // If running, calculate elapsed up to now
          elapsedMs = now - startedAtMs - totalPausedMs;
        }

        // If elapsed time exceeds duration, auto-end the session
        if (elapsedMs >= durationMs) {
          const [updatedSession] = await db.update(sessions)
            .set({ endedAt: new Date() })
            .where(eq(sessions.id, sessionId))
            .returning();
          session = updatedSession;
        }
      }

      // Get all games for this session
      const sessionGames = await db.query.games.findMany({
        where: eq(games.sessionId, sessionId),
        orderBy: (games, { asc }) => [asc(games.startedAt)],
      });

      // Find the current active game if any
      // If currentGameId is set, use that; otherwise find the most recent game
      let currentGame = session.currentGameId
        ? sessionGames.find(g => g.id === session.currentGameId)
        : null;

      // If no currentGameId but there are games, use the most recent one
      // This handles the "game over within session" state
      if (!currentGame && sessionGames.length > 0) {
        currentGame = sessionGames[sessionGames.length - 1];
      }

      // Calculate time remaining
      let timeRemaining: number | null = null;
      if (!session.endedAt) {
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

        timeRemaining = Math.max(0, Math.floor((durationMs - elapsedMs) / 1000));
      }

      return Response.json({
        session,
        games: sessionGames,
        currentGame,
        timeRemaining,
        isEnded: !!session.endedAt,
      });
    } catch (error) {
      console.error("Error fetching session:", error);
      return Response.json({ error: "Failed to fetch session" }, { status: 500 });
    }
  }

  // DELETE - Delete a session (cascades to games and events)
  if (method === "DELETE") {
    try {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get("id");

      if (!sessionId) {
        return Response.json({ error: "Session ID is required" }, { status: 400 });
      }

      // The cascade delete will automatically remove games and events
      const result = await db.delete(sessions)
        .where(eq(sessions.id, sessionId))
        .returning();

      if (result.length === 0) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      return Response.json({ success: true, deleted: result[0] });
    } catch (error) {
      console.error("Error deleting session:", error);
      return Response.json({ error: "Failed to delete session" }, { status: 500 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
