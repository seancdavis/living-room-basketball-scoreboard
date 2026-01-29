import { useState, useCallback, useEffect, useRef } from 'react';

const INITIAL_MISSES = 3;
const SESSION_DURATION = 10 * 60; // 10 minutes in seconds
const FREEBIES_AFTER_TEN = 3;
const MULTIPLIER_SHOTS = 5;

export function useGameState() {
  // Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(SESSION_DURATION);
  const [sessionHighScore, setSessionHighScore] = useState(0);
  const [paused, setPaused] = useState(false);

  // Final shot state - for adding a shot after session timer expires
  const [sessionEndedByTimer, setSessionEndedByTimer] = useState(false);
  const [finalShotAvailable, setFinalShotAvailable] = useState(false);
  const [finalShotUsed, setFinalShotUsed] = useState(false);
  const finalShotTimerRef = useRef(null);

  // Game state
  const [gameActive, setGameActive] = useState(false);
  const [mode, setMode] = useState('multiplier'); // 'multiplier' or 'point'
  const [score, setScore] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [multiplierShotsRemaining, setMultiplierShotsRemaining] = useState(0);
  const [misses, setMisses] = useState(INITIAL_MISSES);
  const [freebiesRemaining, setFreebiesRemaining] = useState(0);
  const [canEnterMultiplierMode, setCanEnterMultiplierMode] = useState(true);

  // Track the last ten threshold passed (0, 10, 20, etc.)
  const [lastTenThreshold, setLastTenThreshold] = useState(0);

  // History for undo functionality (stores snapshots of game state)
  const [history, setHistory] = useState([]);
  const [canUndo, setCanUndo] = useState(false);

  // Timer ref
  const timerRef = useRef(null);

  // Hydration flag to prevent double initialization
  const hydratedRef = useRef(false);

  // Hydrate state from server data
  const hydrateFromServer = useCallback((serverData) => {
    if (!serverData || hydratedRef.current) return;
    hydratedRef.current = true;

    const {
      gameState,
      timeRemaining: serverTimeRemaining,
      isPaused,
      highScore,
      gameIsActive,
      currentGame,
    } = serverData;

    // Set session state
    setSessionActive(true);
    setTimeRemaining(serverTimeRemaining ?? SESSION_DURATION);
    setSessionHighScore(highScore ?? 0);
    setPaused(isPaused ?? false);

    // Set game state based on whether there's an active game
    if (gameIsActive && gameState) {
      // Active game - restore full game state
      setGameActive(true);
      setMode(gameState.mode ?? 'multiplier');
      setScore(gameState.score ?? 0);
      setMultiplier(gameState.multiplier ?? 1);
      setMultiplierShotsRemaining(gameState.multiplierShotsRemaining ?? 0);
      setMisses(gameState.misses ?? INITIAL_MISSES);
      setFreebiesRemaining(gameState.freebiesRemaining ?? 0);
      setLastTenThreshold(Math.floor((gameState.score ?? 0) / 10) * 10);
      // After passing a 10, can enter multiplier mode
      setCanEnterMultiplierMode((gameState.freebiesRemaining ?? 0) > 0);
    } else if (currentGame && gameState) {
      // Inactive game (game over within session) - show game over state
      setGameActive(false);
      // Restore the score from the last game for display
      setScore(gameState.finalScore ?? gameState.score ?? 0);
      setMode(gameState.mode ?? 'point');
      setMultiplier(gameState.multiplier ?? 1);
      setMisses(gameState.misses ?? 0);
    } else {
      // No game exists yet - show game over state to allow starting new game
      setGameActive(false);
      setScore(0);
    }

    // Clear history when hydrating
    setHistory([]);
    setCanUndo(false);
  }, []);

  // Reset hydration flag when session ends
  const resetHydration = useCallback(() => {
    hydratedRef.current = false;
  }, []);

  // Save current game state to history before an action
  const saveToHistory = useCallback(() => {
    const snapshot = {
      mode,
      score,
      multiplier,
      multiplierShotsRemaining,
      misses,
      freebiesRemaining,
      canEnterMultiplierMode,
      lastTenThreshold,
      sessionHighScore,
    };
    setHistory(prev => [...prev.slice(-19), snapshot]); // Keep last 20 states
    setCanUndo(true);
  }, [mode, score, multiplier, multiplierShotsRemaining, misses, freebiesRemaining, canEnterMultiplierMode, lastTenThreshold, sessionHighScore]);

  // Undo the last action
  const undo = useCallback(() => {
    if (history.length === 0 || !gameActive) return false;

    const prevState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));

    // Restore state
    setMode(prevState.mode);
    setScore(prevState.score);
    setMultiplier(prevState.multiplier);
    setMultiplierShotsRemaining(prevState.multiplierShotsRemaining);
    setMisses(prevState.misses);
    setFreebiesRemaining(prevState.freebiesRemaining);
    setCanEnterMultiplierMode(prevState.canEnterMultiplierMode);
    setLastTenThreshold(prevState.lastTenThreshold);
    setSessionHighScore(prevState.sessionHighScore);

    setCanUndo(history.length > 1);
    return true;
  }, [history, gameActive]);

  // Clear history when starting new game
  const clearHistory = useCallback(() => {
    setHistory([]);
    setCanUndo(false);
  }, []);

  // Start a new game within a session
  const startNewGame = useCallback(() => {
    clearHistory();
    setGameActive(true);
    setMode('multiplier');
    setScore(0);
    setMultiplier(1);
    setMultiplierShotsRemaining(0);
    setMisses(INITIAL_MISSES);
    setFreebiesRemaining(0);
    setCanEnterMultiplierMode(true);
    setLastTenThreshold(0);
  }, [clearHistory]);

  // Start a new session
  const startSession = useCallback(() => {
    setSessionActive(true);
    setTimeRemaining(SESSION_DURATION);
    setSessionHighScore(0);
    setSessionEndedByTimer(false);
    setFinalShotAvailable(false);
    setFinalShotUsed(false);
    if (finalShotTimerRef.current) {
      clearTimeout(finalShotTimerRef.current);
    }
    startNewGame();
  }, [startNewGame]);

  // End the current game
  const endGame = useCallback(() => {
    // Update high score if needed
    setSessionHighScore(prev => Math.max(prev, score));
    setGameActive(false);
  }, [score]);

  // End the session
  const endSession = useCallback(() => {
    setSessionHighScore(prev => Math.max(prev, score));
    setSessionActive(false);
    setGameActive(false);
    setPaused(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [score]);

  // Toggle pause
  const togglePause = useCallback(() => {
    if (!sessionActive) return;
    setPaused(prev => !prev);
  }, [sessionActive]);

  // Timer effect
  useEffect(() => {
    if (sessionActive && timeRemaining > 0 && !paused) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timerRef.current);
    } else if (timeRemaining === 0 && sessionActive) {
      // Session ended due to timer - enable final shot window
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSessionEndedByTimer(true);
      setFinalShotAvailable(true);
      setFinalShotUsed(false);
      endSession();

      // Auto-hide final shot option after 60 seconds
      finalShotTimerRef.current = setTimeout(() => {
        setFinalShotAvailable(false);
      }, 60000);
    }
  }, [sessionActive, timeRemaining, paused, endSession]);

  // Cleanup final shot timer
  useEffect(() => {
    return () => {
      if (finalShotTimerRef.current) {
        clearTimeout(finalShotTimerRef.current);
      }
    };
  }, []);

  // Calculate misses to add when passing tens
  const calculateMissesGained = (prevScore, newScore) => {
    const prevTens = Math.floor(prevScore / 10);
    const newTens = Math.floor(newScore / 10);
    return newTens - prevTens;
  };

  // Handle making a shot
  const makeShot = useCallback(() => {
    if (!gameActive) return;

    saveToHistory();

    if (mode === 'multiplier') {
      // In multiplier mode, making a shot increases the multiplier
      setMultiplier(prev => prev + 1);
    } else {
      // In point mode, score points
      const prevScore = score;
      const pointsToAdd = multiplierShotsRemaining > 0 ? multiplier : 1;
      const newScore = score + pointsToAdd;

      console.log('[makeShot] Scoring:', { prevScore, pointsToAdd, newScore, multiplier, multiplierShotsRemaining });

      setScore(newScore);

      // Decrease multiplier shots if using multiplier
      if (multiplierShotsRemaining > 0) {
        const newMultiplierShots = multiplierShotsRemaining - 1;
        setMultiplierShotsRemaining(newMultiplierShots);
        // If multiplier shots run out, reset multiplier to 1
        if (newMultiplierShots <= 0) {
          setMultiplier(1);
        }
      }

      // Check if we passed a multiple of 10
      const missesGained = calculateMissesGained(prevScore, newScore);
      console.log('[makeShot] Lives check:', { prevScore, newScore, missesGained, currentMisses: misses });
      if (missesGained > 0) {
        setMisses(prev => {
          const newMisses = prev + missesGained;
          console.log('[makeShot] Adding lives:', { prev, missesGained, newMisses });
          return newMisses;
        });
        setFreebiesRemaining(FREEBIES_AFTER_TEN);
        setCanEnterMultiplierMode(true);
        setLastTenThreshold(Math.floor(newScore / 10) * 10);
      } else {
        // Making a shot clears freebies (they only protect misses right after passing a 10)
        setFreebiesRemaining(0);
        setCanEnterMultiplierMode(false);
      }

      // Update high score
      setSessionHighScore(prev => Math.max(prev, newScore));
    }
  }, [gameActive, mode, score, multiplier, multiplierShotsRemaining, misses, saveToHistory]);

  // Handle missing a shot
  const missShot = useCallback(() => {
    if (!gameActive) return;

    saveToHistory();

    if (mode === 'multiplier') {
      // In multiplier mode, missing costs a miss
      const newMisses = misses - 1;
      setMisses(newMisses);

      if (newMisses <= 0) {
        endGame();
      }
    } else {
      // In point mode, misses also use up multiplier shots
      if (multiplierShotsRemaining > 0) {
        const newMultiplierShots = multiplierShotsRemaining - 1;
        setMultiplierShotsRemaining(newMultiplierShots);
        // If multiplier shots run out, reset multiplier to 1
        if (newMultiplierShots <= 0) {
          setMultiplier(1);
        }
      }

      // Check for freebies
      if (freebiesRemaining > 0) {
        setFreebiesRemaining(prev => prev - 1);
        // Using a freebie means you chose to continue shooting, forfeit multiplier mode entry
        setCanEnterMultiplierMode(false);
      } else {
        // No freebies, spend a miss
        const newMisses = misses - 1;
        setMisses(newMisses);

        if (newMisses <= 0) {
          endGame();
        }
      }
    }
  }, [gameActive, mode, misses, freebiesRemaining, multiplierShotsRemaining, endGame, saveToHistory]);

  // Switch to point mode (from multiplier mode)
  const enterPointMode = useCallback(() => {
    if (mode !== 'multiplier') return;

    saveToHistory();

    setMode('point');
    // Set multiplier shots to 5 if multiplier > 1
    if (multiplier > 1) {
      setMultiplierShotsRemaining(MULTIPLIER_SHOTS);
    }
    setCanEnterMultiplierMode(false);
    setFreebiesRemaining(FREEBIES_AFTER_TEN); // Start of game, at "0" threshold
  }, [mode, multiplier, saveToHistory]);

  // Switch to multiplier mode (from point mode, when allowed)
  const enterMultiplierMode = useCallback(() => {
    if (!canEnterMultiplierMode || mode !== 'point') return;

    saveToHistory();

    setMode('multiplier');
    setMultiplier(1); // Reset multiplier when entering multiplier mode
    setFreebiesRemaining(0);
  }, [canEnterMultiplierMode, mode, saveToHistory]);

  // Continue shooting in point mode (forfeit multiplier mode entry)
  const continueInPointMode = useCallback(() => {
    if (!canEnterMultiplierMode || mode !== 'point') return;
    setCanEnterMultiplierMode(false);
  }, [canEnterMultiplierMode, mode]);

  // Add a final make after session timer expired
  const addFinalMake = useCallback(() => {
    if (!finalShotAvailable || finalShotUsed) return null;

    // Calculate points to add (use current mode logic)
    const pointsToAdd = multiplierShotsRemaining > 0 ? multiplier : 1;
    const newScore = score + pointsToAdd;

    setScore(newScore);
    setSessionHighScore(prev => Math.max(prev, newScore));
    setFinalShotUsed(true);
    setFinalShotAvailable(false);

    if (finalShotTimerRef.current) {
      clearTimeout(finalShotTimerRef.current);
    }

    return { pointsAdded: pointsToAdd, newScore };
  }, [finalShotAvailable, finalShotUsed, score, multiplier, multiplierShotsRemaining]);

  // Add a final miss after session timer expired
  const addFinalMiss = useCallback(() => {
    if (!finalShotAvailable || finalShotUsed) return false;

    // Miss doesn't change score, but we track it
    setFinalShotUsed(true);
    setFinalShotAvailable(false);

    if (finalShotTimerRef.current) {
      clearTimeout(finalShotTimerRef.current);
    }

    return true;
  }, [finalShotAvailable, finalShotUsed]);

  return {
    // Session state
    sessionActive,
    timeRemaining,
    sessionHighScore,
    paused,

    // Final shot state
    sessionEndedByTimer,
    finalShotAvailable,
    finalShotUsed,

    // Game state
    gameActive,
    mode,
    score,
    multiplier,
    multiplierShotsRemaining,
    misses,
    freebiesRemaining,
    canEnterMultiplierMode,
    canUndo,

    // Actions
    startSession,
    startNewGame,
    endSession,
    togglePause,
    makeShot,
    missShot,
    enterPointMode,
    enterMultiplierMode,
    continueInPointMode,
    undo,
    addFinalMake,
    addFinalMiss,
    // Hydration
    hydrateFromServer,
    resetHydration,
  };
}
