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
  // eslint-disable-next-line no-unused-vars
  const [lastTenThreshold, setLastTenThreshold] = useState(0);

  // Timer ref
  const timerRef = useRef(null);

  // Start a new game within a session
  const startNewGame = useCallback(() => {
    setGameActive(true);
    setMode('multiplier');
    setScore(0);
    setMultiplier(1);
    setMultiplierShotsRemaining(0);
    setMisses(INITIAL_MISSES);
    setFreebiesRemaining(0);
    setCanEnterMultiplierMode(true);
    setLastTenThreshold(0);
  }, []);

  // Start a new session
  const startSession = useCallback(() => {
    setSessionActive(true);
    setTimeRemaining(SESSION_DURATION);
    setSessionHighScore(0);
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
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  }, [score]);

  // Timer effect
  useEffect(() => {
    if (sessionActive && timeRemaining > 0) {
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      endSession();
    }
  }, [sessionActive, timeRemaining, endSession]);

  // Calculate misses to add when passing tens
  const calculateMissesGained = (prevScore, newScore) => {
    const prevTens = Math.floor(prevScore / 10);
    const newTens = Math.floor(newScore / 10);
    return newTens - prevTens;
  };

  // Handle making a shot
  const makeShot = useCallback(() => {
    if (!gameActive) return;

    if (mode === 'multiplier') {
      // In multiplier mode, making a shot increases the multiplier
      setMultiplier(prev => prev + 1);
    } else {
      // In point mode, score points
      const prevScore = score;
      const pointsToAdd = multiplierShotsRemaining > 0 ? multiplier : 1;
      const newScore = score + pointsToAdd;

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
      if (missesGained > 0) {
        setMisses(prev => prev + missesGained);
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
  }, [gameActive, mode, score, multiplier, multiplierShotsRemaining]);

  // Handle missing a shot
  const missShot = useCallback(() => {
    if (!gameActive) return;

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
  }, [gameActive, mode, misses, freebiesRemaining, multiplierShotsRemaining, endGame]);

  // Switch to point mode (from multiplier mode)
  const enterPointMode = useCallback(() => {
    if (mode !== 'multiplier') return;

    setMode('point');
    // Set multiplier shots to 5 if multiplier > 1
    if (multiplier > 1) {
      setMultiplierShotsRemaining(MULTIPLIER_SHOTS);
    }
    setCanEnterMultiplierMode(false);
    setFreebiesRemaining(FREEBIES_AFTER_TEN); // Start of game, at "0" threshold
  }, [mode, multiplier]);

  // Switch to multiplier mode (from point mode, when allowed)
  const enterMultiplierMode = useCallback(() => {
    if (!canEnterMultiplierMode || mode !== 'point') return;

    setMode('multiplier');
    setMultiplier(1); // Reset multiplier when entering multiplier mode
    setFreebiesRemaining(0);
  }, [canEnterMultiplierMode, mode]);

  // Continue shooting in point mode (forfeit multiplier mode entry)
  const continueInPointMode = useCallback(() => {
    if (!canEnterMultiplierMode || mode !== 'point') return;
    setCanEnterMultiplierMode(false);
  }, [canEnterMultiplierMode, mode]);

  return {
    // Session state
    sessionActive,
    timeRemaining,
    sessionHighScore,

    // Game state
    gameActive,
    mode,
    score,
    multiplier,
    multiplierShotsRemaining,
    misses,
    freebiesRemaining,
    canEnterMultiplierMode,

    // Actions
    startSession,
    startNewGame,
    endSession,
    makeShot,
    missShot,
    enterPointMode,
    enterMultiplierMode,
    continueInPointMode,
  };
}
