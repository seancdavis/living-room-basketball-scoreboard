import type { Context } from "@netlify/functions";
import { db, events } from "../../db";

export default async (req: Request, context: Context) => {
  const method = req.method;

  // POST - Record a new event
  if (method === "POST") {
    try {
      const body = await req.json();
      const {
        gameId,
        eventType,
        score,
        multiplier,
        multiplierShotsRemaining,
        missesRemaining,
        freebiesRemaining,
        mode,
        pointsEarned,
        previousMode,
        newMode,
        usedFreebie,
        isTipIn,
        sequenceNumber,
      } = body;

      if (!gameId || !eventType || sequenceNumber === undefined) {
        return Response.json({
          error: "gameId, eventType, and sequenceNumber are required"
        }, { status: 400 });
      }

      const [event] = await db.insert(events).values({
        gameId,
        eventType,
        score: score ?? 0,
        multiplier: multiplier ?? 1,
        multiplierShotsRemaining: multiplierShotsRemaining ?? 0,
        missesRemaining: missesRemaining ?? 3,
        freebiesRemaining: freebiesRemaining ?? 0,
        mode: mode ?? 'multiplier',
        pointsEarned,
        previousMode,
        newMode,
        usedFreebie,
        isTipIn,
        sequenceNumber,
      }).returning();

      return Response.json({ event });
    } catch (error) {
      console.error("Error recording event:", error);
      return Response.json({ error: "Failed to record event" }, { status: 500 });
    }
  }

  // POST with batch - Record multiple events at once (for offline sync)
  if (method === "PUT") {
    try {
      const body = await req.json();
      const { events: eventBatch } = body;

      if (!Array.isArray(eventBatch) || eventBatch.length === 0) {
        return Response.json({ error: "events array is required" }, { status: 400 });
      }

      const insertedEvents = await db.insert(events).values(
        eventBatch.map((e: any) => ({
          gameId: e.gameId,
          eventType: e.eventType,
          score: e.score ?? 0,
          multiplier: e.multiplier ?? 1,
          multiplierShotsRemaining: e.multiplierShotsRemaining ?? 0,
          missesRemaining: e.missesRemaining ?? 3,
          freebiesRemaining: e.freebiesRemaining ?? 0,
          mode: e.mode ?? 'multiplier',
          pointsEarned: e.pointsEarned,
          previousMode: e.previousMode,
          newMode: e.newMode,
          usedFreebie: e.usedFreebie,
          isTipIn: e.isTipIn,
          sequenceNumber: e.sequenceNumber,
        }))
      ).returning();

      return Response.json({ events: insertedEvents });
    } catch (error) {
      console.error("Error batch recording events:", error);
      return Response.json({ error: "Failed to batch record events" }, { status: 500 });
    }
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
};

export const config = {
  path: '/api/event'
};
