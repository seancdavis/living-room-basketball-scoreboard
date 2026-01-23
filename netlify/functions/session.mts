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
      const { sessionId, highScore, totalGames, totalPoints } = body;

      if (!sessionId) {
        return Response.json({ error: "sessionId is required" }, { status: 400 });
      }

      const [session] = await db.update(sessions)
        .set({
          highScore,
          totalGames,
          totalPoints,
          endedAt: new Date(),
        })
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
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });

      if (!session) {
        return Response.json({ error: "Session not found" }, { status: 404 });
      }

      const sessionGames = await db.query.games.findMany({
        where: eq(games.sessionId, sessionId),
        orderBy: (games, { asc }) => [asc(games.startedAt)],
      });

      return Response.json({ session, games: sessionGames });
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
