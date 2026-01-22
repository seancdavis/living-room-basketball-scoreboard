import type { Context } from "@netlify/functions";
import { db, sessions, games } from "../../db";
import { eq } from "drizzle-orm";

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

  // GET - Get session details with games
  if (method === "GET") {
    try {
      const url = new URL(req.url);
      const sessionId = url.searchParams.get("id");

      if (!sessionId) {
        return Response.json({ error: "Session ID is required" }, { status: 400 });
      }

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

  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
