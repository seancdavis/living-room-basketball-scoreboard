import { useState, useEffect, useCallback } from 'react';

// Hook for fetching and syncing game state with the server
export function useServerState(sessionId) {
  const [loading, setLoading] = useState(!!sessionId);
  const [error, setError] = useState(null);
  const [serverState, setServerState] = useState(null);

  // Fetch session state from server
  const fetchSessionState = useCallback(async () => {
    if (!sessionId) {
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/session?id=${sessionId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }
      const data = await response.json();
      setServerState(data);
      setLoading(false);
      return data;
    } catch (err) {
      console.error('Failed to fetch session state:', err);
      setError(err.message);
      setLoading(false);
      return null;
    }
  }, [sessionId]);

  // Fetch on mount if sessionId is provided
  useEffect(() => {
    if (sessionId) {
      fetchSessionState();
    }
  }, [sessionId, fetchSessionState]);

  // Update session state on server (pause/resume)
  const updateSessionState = useCallback(async (updates) => {
    if (!sessionId) return;

    try {
      await fetch('/api/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, ...updates }),
      });
    } catch (err) {
      console.error('Failed to update session state:', err);
    }
  }, [sessionId]);

  // Update game state on server
  const updateGameState = useCallback(async (gameId, updates) => {
    if (!gameId) return;

    try {
      await fetch('/api/game', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, ...updates }),
      });
    } catch (err) {
      console.error('Failed to update game state:', err);
    }
  }, []);

  return {
    loading,
    error,
    serverState,
    fetchSessionState,
    updateSessionState,
    updateGameState,
  };
}

// Calculate time remaining from server timestamps
export function calculateTimeRemaining(session) {
  if (!session || session.endedAt) {
    return 0;
  }

  const now = Date.now();
  const startedAtMs = new Date(session.startedAt).getTime();
  const durationMs = session.durationSeconds * 1000;
  const totalPausedMs = session.totalPausedMs || 0;

  let elapsedMs;
  if (session.isPaused && session.pausedAt) {
    // If paused, calculate elapsed up to pause time
    elapsedMs = new Date(session.pausedAt).getTime() - startedAtMs - totalPausedMs;
  } else {
    // If running, calculate elapsed up to now
    elapsedMs = now - startedAtMs - totalPausedMs;
  }

  return Math.max(0, Math.floor((durationMs - elapsedMs) / 1000));
}

// Convert server state to game state format
export function serverStateToGameState(serverState) {
  if (!serverState || !serverState.session) {
    return null;
  }

  const { session, currentGame, timeRemaining, isEnded } = serverState;

  // If session is ended, return read-only state
  if (isEnded) {
    return {
      sessionEnded: true,
      session,
      games: serverState.games || [],
    };
  }

  // Calculate game state from current game
  let gameState = null;
  if (currentGame && currentGame.isActive) {
    gameState = {
      score: currentGame.currentScore,
      multiplier: currentGame.currentMultiplier,
      multiplierShotsRemaining: currentGame.currentMultiplierShotsRemaining,
      misses: currentGame.currentMisses,
      freebiesRemaining: currentGame.currentFreebiesRemaining,
      mode: currentGame.currentMode,
    };
  }

  return {
    sessionEnded: false,
    session,
    currentGame,
    gameState,
    timeRemaining: timeRemaining ?? calculateTimeRemaining(session),
    isPaused: session.isPaused,
    highScore: session.highScore,
    games: serverState.games || [],
  };
}
