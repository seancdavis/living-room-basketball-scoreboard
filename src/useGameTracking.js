import { useRef, useCallback } from 'react';

// Hook for tracking game data to the database
export function useGameTracking() {
  const sessionIdRef = useRef(null);
  const sessionPromiseRef = useRef(null);
  const gameIdRef = useRef(null);
  const gamePromiseRef = useRef(null);
  const sequenceNumberRef = useRef(0);
  const pendingEventsRef = useRef([]);
  const gameStartTimeRef = useRef(null);
  const statsRef = useRef({ makes: 0, misses: 0, highMultiplier: 1 });

  // Create a new session in the database
  const createSession = useCallback(async () => {
    const promise = (async () => {
      try {
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ durationSeconds: 600 }),
        });
        const data = await response.json();
        if (data.session) {
          sessionIdRef.current = data.session.id;
          return data.session.id;
        }
      } catch (error) {
        console.error('Failed to create session:', error);
      }
      return null;
    })();

    sessionPromiseRef.current = promise;
    return promise;
  }, []);

  // End the current session
  const endSessionTracking = useCallback(async (highScore, totalPoints, totalGames) => {
    if (!sessionIdRef.current) return;

    try {
      await fetch('/api/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sessionIdRef.current,
          highScore,
          totalPoints,
          totalGames,
        }),
      });
    } catch (error) {
      console.error('Failed to end session:', error);
    } finally {
      sessionIdRef.current = null;
    }
  }, []);

  // Create a new game in the database
  const createGame = useCallback(async () => {
    const promise = (async () => {
      // Wait for session to be created if it's still pending
      if (!sessionIdRef.current && sessionPromiseRef.current) {
        await sessionPromiseRef.current;
      }

      if (!sessionIdRef.current) {
        console.error('Failed to create game: no session ID');
        return null;
      }

      try {
        const response = await fetch('/api/game', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        });
        const data = await response.json();
        if (data.game) {
          gameIdRef.current = data.game.id;
          sequenceNumberRef.current = 0;
          pendingEventsRef.current = [];
          gameStartTimeRef.current = Date.now();
          statsRef.current = { makes: 0, misses: 0, highMultiplier: 1 };
          return data.game.id;
        }
      } catch (error) {
        console.error('Failed to create game:', error);
      }
      return null;
    })();

    gamePromiseRef.current = promise;
    return promise;
  }, []);

  // End the current game
  const endGameTracking = useCallback(async (finalScore, endReason) => {
    // Wait for game to be created if it's still pending
    if (!gameIdRef.current && gamePromiseRef.current) {
      await gamePromiseRef.current;
    }

    if (!gameIdRef.current) {
      console.error('Failed to end game: no game ID');
      return;
    }

    const durationSeconds = gameStartTimeRef.current
      ? Math.floor((Date.now() - gameStartTimeRef.current) / 1000)
      : 0;

    try {
      // First flush any pending events
      if (pendingEventsRef.current.length > 0) {
        await fetch('/api/event', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ events: pendingEventsRef.current }),
        });
        pendingEventsRef.current = [];
      }

      // Then update the game
      await fetch('/api/game', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameIdRef.current,
          finalScore,
          highMultiplier: statsRef.current.highMultiplier,
          totalMakes: statsRef.current.makes,
          totalMisses: statsRef.current.misses,
          durationSeconds,
          endReason,
        }),
      });
    } catch (error) {
      console.error('Failed to end game:', error);
    } finally {
      gameIdRef.current = null;
      gameStartTimeRef.current = null;
    }
  }, []);

  // Queue for events that arrive before game is created
  const earlyEventsRef = useRef([]);

  // Record an event
  const recordEvent = useCallback((eventData) => {
    // Track stats immediately (before we know game ID)
    if (eventData.eventType === 'make') {
      statsRef.current.makes++;
      if (eventData.multiplier > statsRef.current.highMultiplier) {
        statsRef.current.highMultiplier = eventData.multiplier;
      }
    } else if (eventData.eventType === 'miss') {
      statsRef.current.misses++;
    }

    // If game isn't created yet, queue the event and wait
    if (!gameIdRef.current) {
      earlyEventsRef.current.push(eventData);

      // Start waiting for game to be created
      if (gamePromiseRef.current) {
        gamePromiseRef.current.then(() => {
          if (gameIdRef.current && earlyEventsRef.current.length > 0) {
            // Process queued events
            const queuedEvents = earlyEventsRef.current.map((data) => ({
              gameId: gameIdRef.current,
              sequenceNumber: sequenceNumberRef.current++,
              ...data,
            }));
            earlyEventsRef.current = [];
            pendingEventsRef.current.push(...queuedEvents);

            // Send them
            const eventsToSend = [...pendingEventsRef.current];
            pendingEventsRef.current = [];
            fetch('/api/event', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ events: eventsToSend }),
            }).catch(error => {
              console.error('Failed to record events:', error);
              pendingEventsRef.current = [...eventsToSend, ...pendingEventsRef.current];
            });
          }
        });
      }
      return;
    }

    const event = {
      gameId: gameIdRef.current,
      sequenceNumber: sequenceNumberRef.current++,
      ...eventData,
    };

    // Add to pending events
    pendingEventsRef.current.push(event);

    // Batch send events (every 5 events or immediately for important events)
    const importantEvents = ['game_start', 'game_end', 'mode_change'];
    if (pendingEventsRef.current.length >= 5 || importantEvents.includes(eventData.eventType)) {
      const eventsToSend = [...pendingEventsRef.current];
      pendingEventsRef.current = [];

      fetch('/api/event', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: eventsToSend }),
      }).catch(error => {
        console.error('Failed to record events:', error);
        // Put events back for retry
        pendingEventsRef.current = [...eventsToSend, ...pendingEventsRef.current];
      });
    }
  }, []);

  // Helper to record a make event
  const recordMake = useCallback((state, isTipIn = false) => {
    recordEvent({
      eventType: 'make',
      score: state.score,
      multiplier: state.multiplier,
      multiplierShotsRemaining: state.multiplierShotsRemaining,
      missesRemaining: state.misses,
      freebiesRemaining: state.freebiesRemaining,
      mode: state.mode,
      pointsEarned: state.pointsEarned || 0,
      isTipIn,
    });
  }, [recordEvent]);

  // Helper to record a miss event
  const recordMiss = useCallback((state, usedFreebie = false, isTipIn = false) => {
    recordEvent({
      eventType: 'miss',
      score: state.score,
      multiplier: state.multiplier,
      multiplierShotsRemaining: state.multiplierShotsRemaining,
      missesRemaining: state.misses,
      freebiesRemaining: state.freebiesRemaining,
      mode: state.mode,
      usedFreebie,
      isTipIn,
    });
  }, [recordEvent]);

  // Helper to record mode change
  const recordModeChange = useCallback((state, previousMode, newMode) => {
    recordEvent({
      eventType: 'mode_change',
      score: state.score,
      multiplier: state.multiplier,
      multiplierShotsRemaining: state.multiplierShotsRemaining,
      missesRemaining: state.misses,
      freebiesRemaining: state.freebiesRemaining,
      mode: newMode,
      previousMode,
      newMode,
    });
  }, [recordEvent]);

  // Sync current game state to server (for persistence)
  const syncGameState = useCallback(async (state) => {
    if (!gameIdRef.current) return;

    try {
      await fetch('/api/game', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId: gameIdRef.current,
          currentScore: state.score,
          currentMultiplier: state.multiplier,
          currentMultiplierShotsRemaining: state.multiplierShotsRemaining,
          currentMisses: state.misses,
          currentFreebiesRemaining: state.freebiesRemaining,
          currentMode: state.mode,
        }),
      });
    } catch (error) {
      console.error('Failed to sync game state:', error);
    }
  }, []);

  // Sync session pause state to server
  const syncSessionPause = useCallback(async (isPaused, pausedAt, totalPausedMs) => {
    if (!sessionIdRef.current) return;

    try {
      await fetch('/api/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          isPaused,
          pausedAt: pausedAt ? new Date(pausedAt).toISOString() : null,
          totalPausedMs,
        }),
      });
    } catch (error) {
      console.error('Failed to sync session pause state:', error);
    }
  }, []);

  return {
    createSession,
    endSessionTracking,
    createGame,
    endGameTracking,
    recordMake,
    recordMiss,
    recordModeChange,
    syncGameState,
    syncSessionPause,
    // Expose refs for checking state
    hasActiveSession: () => !!sessionIdRef.current,
    hasActiveGame: () => !!gameIdRef.current,
    getSessionId: () => sessionIdRef.current,
    getGameId: () => gameIdRef.current,
    // For hydration
    setSessionId: (id) => { sessionIdRef.current = id; },
    setGameId: (id) => { gameIdRef.current = id; },
  };
}
