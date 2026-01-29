import { useCallback, useState, useRef, useEffect } from 'react'
import { Routes, Route, useNavigate, useParams, Link } from 'react-router-dom'
import { useGameState } from './useGameState'
import { useVoiceControl } from './useVoiceControl'
import { useMicrophoneSelector } from './useMicrophoneSelector'
import { useGameTracking } from './useGameTracking'
import { useAudioFeedback } from './useAudioFeedback'
import { useServerState, serverStateToGameState } from './useServerState'
import VoiceButton from './VoiceButton'
import History from './History'
import './App.css'

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function GameSession() {
  const navigate = useNavigate()
  const { sessionId: urlSessionId } = useParams()

  const {
    sessionActive,
    timeRemaining,
    sessionHighScore,
    paused,
    sessionEndedByTimer,
    finalShotAvailable,
    gameActive,
    mode,
    score,
    multiplier,
    multiplierShotsRemaining,
    misses,
    freebiesRemaining,
    canEnterMultiplierMode,
    startSession,
    startNewGame,
    endSession,
    togglePause,
    makeShot,
    missShot,
    enterPointMode,
    enterMultiplierMode,
    undo,
    canUndo,
    addFinalMake,
    addFinalMiss,
    hydrateFromServer,
  } = useGameState()

  // Database tracking
  const {
    createSession,
    endSessionTracking,
    createGame,
    endGameTracking,
    recordMake,
    recordMiss,
    recordModeChange,
    syncGameState,
    syncSessionPause,
    setSessionId,
    setGameId,
  } = useGameTracking()

  // Server state for hydration
  const { loading: serverLoading, error: serverError, serverState } = useServerState(urlSessionId)
  const [hydrationComplete, setHydrationComplete] = useState(!urlSessionId)
  const [endedSessionData, setEndedSessionData] = useState(null)

  // Hydrate state from server when loading a session from URL
  useEffect(() => {
    if (urlSessionId && serverState && !hydrationComplete) {
      const gameData = serverStateToGameState(serverState)
      if (gameData) {
        if (gameData.sessionEnded) {
          // Session is ended - show read-only view
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setEndedSessionData(gameData)
        } else {
          // Session is active - hydrate state
          hydrateFromServer(gameData)
          setSessionId(serverState.session.id)
          if (serverState.currentGame) {
            setGameId(serverState.currentGame.id)
          }
        }
      }
      setHydrationComplete(true)
    }
  }, [urlSessionId, serverState, hydrationComplete, hydrateFromServer, setSessionId, setGameId])

  // Audio feedback
  const {
    playMake,
    playMiss,
    playPointMode,
    playMultiplierMode,
    playGameOver,
    playPassedTen,
    playPauseToggle,
    playListeningStart,
    playProcessing,
    playCommandRecognized,
    playCommandUnknown,
    playUndo,
  } = useAudioFeedback()

  // Wrap undo with sound
  const undoWithSound = useCallback(() => {
    if (undo()) {
      playUndo()
    }
  }, [undo, playUndo])

  // Track game count and total points for session stats
  const gameCountRef = useRef(0)
  const totalPointsRef = useRef(0)
  const prevScoreRef = useRef(0)

  // Wrapped miss action that includes tracking
  const prevMissesRef = useRef(misses)
  const prevFreebiesRef = useRef(freebiesRemaining)
  const trackingMissRef = useRef(false)
  const pendingTipInRef = useRef(false)

  const trackedMissShot = useCallback(() => {
    trackingMissRef.current = true
    missShot()
  }, [missShot])

  // Tip-in actions
  const tipInMakeShot = useCallback(() => {
    pendingTipInRef.current = true
    makeShot()
  }, [makeShot])

  const tipInMissShot = useCallback(() => {
    pendingTipInRef.current = true
    trackingMissRef.current = true
    missShot()
  }, [missShot])

  // Final shot handlers (for adding a shot after session timer expires)
  const handleFinalMake = useCallback(() => {
    const result = addFinalMake()
    if (result) {
      playMake()
      // Track the final make
      recordMake({
        score: result.newScore,
        multiplier,
        multiplierShotsRemaining,
        misses,
        freebiesRemaining,
        mode,
        pointsEarned: result.pointsAdded,
      }, false)
    }
  }, [addFinalMake, playMake, recordMake, multiplier, multiplierShotsRemaining, misses, freebiesRemaining, mode])

  const handleFinalMiss = useCallback(() => {
    if (addFinalMiss()) {
      playMiss()
      // Track the final miss
      recordMiss({
        score,
        multiplier,
        multiplierShotsRemaining,
        misses,
        freebiesRemaining,
        mode,
      }, false, false)
    }
  }, [addFinalMiss, playMiss, recordMiss, score, multiplier, multiplierShotsRemaining, misses, freebiesRemaining, mode])

  // Use refs to avoid stale closures in voice command handler
  const gameStateRef = useRef({ gameActive, mode, sessionActive, canEnterMultiplierMode, paused, canUndo })
  const actionsRef = useRef({ makeShot, missShot: trackedMissShot, tipInMakeShot, tipInMissShot, enterPointMode, enterMultiplierMode, startSession, startNewGame, endSession, togglePause, undo: undoWithSound })

  useEffect(() => {
    gameStateRef.current = { gameActive, mode, sessionActive, canEnterMultiplierMode, paused, canUndo }
  }, [gameActive, mode, sessionActive, canEnterMultiplierMode, paused, canUndo])

  useEffect(() => {
    actionsRef.current = { makeShot, missShot: trackedMissShot, tipInMakeShot, tipInMissShot, enterPointMode, enterMultiplierMode, startSession, startNewGame, endSession, togglePause, undo: undoWithSound }
  }, [makeShot, trackedMissShot, tipInMakeShot, tipInMissShot, enterPointMode, enterMultiplierMode, startSession, startNewGame, endSession, togglePause, undoWithSound])

  // Track session lifecycle
  const prevSessionActiveRef = useRef(false)
  useEffect(() => {
    const wasActive = prevSessionActiveRef.current
    prevSessionActiveRef.current = sessionActive

    if (sessionActive && !wasActive) {
      // Session just started
      gameCountRef.current = 0
      totalPointsRef.current = 0
      createSession().then((newSessionId) => {
        if (newSessionId) {
          // Navigate to session URL
          navigate(`/session/${newSessionId}`, { replace: true })
        }
      })
    } else if (!sessionActive && wasActive) {
      // Session just ended
      endSessionTracking(sessionHighScore, totalPointsRef.current, gameCountRef.current)
      // Navigate back to home
      navigate('/', { replace: true })
    }
  }, [sessionActive, sessionHighScore, createSession, endSessionTracking, navigate])

  // Track game lifecycle
  const prevGameActiveRef = useRef(false)
  useEffect(() => {
    const wasActive = prevGameActiveRef.current
    prevGameActiveRef.current = gameActive

    if (gameActive && !wasActive) {
      // Game just started
      gameCountRef.current++
      prevScoreRef.current = 0
      createGame()
    } else if (!gameActive && wasActive) {
      // Game just ended
      totalPointsRef.current += score
      const endReason = misses <= 0 ? 'out_of_misses' : (timeRemaining <= 0 ? 'session_ended' : 'manual_end')
      endGameTracking(score, endReason)
    }
  }, [gameActive, score, misses, timeRemaining, createGame, endGameTracking])

  // Track score changes (makes in point mode)
  useEffect(() => {
    if (!gameActive) return
    const prevScore = prevScoreRef.current
    if (score > prevScore) {
      const pointsEarned = score - prevScore
      const isTipIn = pendingTipInRef.current
      pendingTipInRef.current = false
      recordMake({
        score,
        multiplier,
        multiplierShotsRemaining,
        misses,
        freebiesRemaining,
        mode,
        pointsEarned,
      }, isTipIn)
    }
    prevScoreRef.current = score
  }, [score, gameActive, multiplier, multiplierShotsRemaining, misses, freebiesRemaining, mode, recordMake])

  // Track multiplier changes (makes in multiplier mode)
  const prevMultiplierRef = useRef(multiplier)
  useEffect(() => {
    if (!gameActive) return
    const prevMultiplier = prevMultiplierRef.current
    // Multiplier increases when making a shot in multiplier mode
    if (multiplier > prevMultiplier && mode === 'multiplier') {
      const isTipIn = pendingTipInRef.current
      pendingTipInRef.current = false
      recordMake({
        score,
        multiplier,
        multiplierShotsRemaining,
        misses,
        freebiesRemaining,
        mode,
        pointsEarned: 0, // No points earned in multiplier mode
      }, isTipIn)
    }
    prevMultiplierRef.current = multiplier
  }, [multiplier, gameActive, score, multiplierShotsRemaining, misses, freebiesRemaining, mode, recordMake])

  // Track mode changes
  const prevModeRef = useRef(mode)
  useEffect(() => {
    if (!gameActive) return
    const prevMode = prevModeRef.current
    if (mode !== prevMode) {
      recordModeChange({
        score,
        multiplier,
        multiplierShotsRemaining,
        misses,
        freebiesRemaining,
        mode,
      }, prevMode, mode)
    }
    prevModeRef.current = mode
  }, [mode, gameActive, score, multiplier, multiplierShotsRemaining, misses, freebiesRemaining, recordModeChange])

  // Track misses after they happen
  useEffect(() => {
    if (!gameActive || !trackingMissRef.current) {
      prevMissesRef.current = misses
      prevFreebiesRef.current = freebiesRemaining
      return
    }

    const prevMisses = prevMissesRef.current
    const prevFreebies = prevFreebiesRef.current
    trackingMissRef.current = false

    // Determine if a freebie was used
    const usedFreebie = prevFreebies > freebiesRemaining && prevMisses === misses

    // Check if this was a tip-in
    const isTipIn = pendingTipInRef.current
    pendingTipInRef.current = false

    recordMiss({
      score,
      multiplier,
      multiplierShotsRemaining,
      misses,
      freebiesRemaining,
      mode,
    }, usedFreebie, isTipIn)

    prevMissesRef.current = misses
    prevFreebiesRef.current = freebiesRemaining
  }, [gameActive, misses, freebiesRemaining, score, multiplier, multiplierShotsRemaining, mode, recordMiss])

  // Sync game state to server on changes (debounced)
  const syncTimeoutRef = useRef(null)
  useEffect(() => {
    if (!gameActive) return

    // Debounce sync to avoid too many API calls
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = setTimeout(() => {
      syncGameState({
        score,
        multiplier,
        multiplierShotsRemaining,
        misses,
        freebiesRemaining,
        mode,
      })
    }, 500) // Sync after 500ms of no changes

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current)
      }
    }
  }, [gameActive, score, multiplier, multiplierShotsRemaining, misses, freebiesRemaining, mode, syncGameState])

  // Sync pause state to server
  const pauseStartTimeRef = useRef(null)
  const totalPausedMsRef = useRef(0)
  const prevPausedRef = useRef(paused)

  useEffect(() => {
    if (!sessionActive) {
      pauseStartTimeRef.current = null
      totalPausedMsRef.current = 0
      prevPausedRef.current = paused
      return
    }

    const wasPaused = prevPausedRef.current
    prevPausedRef.current = paused

    if (paused && !wasPaused) {
      // Just paused
      pauseStartTimeRef.current = Date.now()
      syncSessionPause(true, pauseStartTimeRef.current, totalPausedMsRef.current)
    } else if (!paused && wasPaused && pauseStartTimeRef.current) {
      // Just resumed
      const pauseDuration = Date.now() - pauseStartTimeRef.current
      totalPausedMsRef.current += pauseDuration
      pauseStartTimeRef.current = null
      syncSessionPause(false, null, totalPausedMsRef.current)
    }
  }, [paused, sessionActive, syncSessionPause])

  // Audio feedback for score changes (makes in point mode)
  const audioScoreRef = useRef(score)
  useEffect(() => {
    if (!gameActive) {
      audioScoreRef.current = score
      return
    }
    if (score > audioScoreRef.current) {
      playMake()
    }
    audioScoreRef.current = score
  }, [score, gameActive, playMake])

  // Audio feedback for multiplier increases (makes in multiplier mode)
  const audioMultiplierRef = useRef(multiplier)
  useEffect(() => {
    if (!gameActive) {
      audioMultiplierRef.current = multiplier
      return
    }
    // Play make sound when multiplier increases (making a shot in multiplier mode)
    if (multiplier > audioMultiplierRef.current && mode === 'multiplier') {
      playMake()
    }
    audioMultiplierRef.current = multiplier
  }, [multiplier, mode, gameActive, playMake])

  // Audio feedback for misses
  const audioMissesRef = useRef(misses)
  const audioFreebiesRef = useRef(freebiesRemaining)
  useEffect(() => {
    if (!gameActive) {
      audioMissesRef.current = misses
      audioFreebiesRef.current = freebiesRemaining
      return
    }
    // Play miss sound when misses decrease OR when freebies decrease (freebie used)
    if (misses < audioMissesRef.current || freebiesRemaining < audioFreebiesRef.current) {
      playMiss()
    }
    // Play celebration when passing a 10 (freebies increase to 3)
    if (freebiesRemaining === 3 && audioFreebiesRef.current < 3) {
      playPassedTen()
    }
    audioMissesRef.current = misses
    audioFreebiesRef.current = freebiesRemaining
  }, [misses, freebiesRemaining, gameActive, playMiss, playPassedTen])

  // Audio feedback for mode changes
  const audioModeRef = useRef(mode)
  useEffect(() => {
    if (!gameActive) {
      audioModeRef.current = mode
      return
    }
    if (mode !== audioModeRef.current) {
      if (mode === 'point') {
        playPointMode()
      } else {
        playMultiplierMode()
      }
    }
    audioModeRef.current = mode
  }, [mode, gameActive, playPointMode, playMultiplierMode])

  // Audio feedback for game over
  const audioGameActiveRef = useRef(gameActive)
  useEffect(() => {
    if (!gameActive && audioGameActiveRef.current) {
      // Game just ended
      playGameOver()
    }
    audioGameActiveRef.current = gameActive
  }, [gameActive, playGameOver])

  // Audio feedback for pause toggle
  const audioPausedRef = useRef(paused)
  useEffect(() => {
    if (paused !== audioPausedRef.current && sessionActive) {
      playPauseToggle()
    }
    audioPausedRef.current = paused
  }, [paused, sessionActive, playPauseToggle])

  // Handle voice commands - uses refs to always have current state
  const handleVoiceCommand = useCallback((action) => {
    const { gameActive: ga, mode: m, sessionActive: sa, canEnterMultiplierMode: cemm, paused: p, canUndo: cu } = gameStateRef.current
    const { makeShot: ms, missShot: miss, tipInMakeShot: tms, tipInMissShot: tmiss, enterPointMode: epm, enterMultiplierMode: emm, startSession: ss, startNewGame: sng, endSession: es, togglePause: tp, undo: ud } = actionsRef.current

    console.log('[App] Voice command received:', action, { gameActive: ga, mode: m, sessionActive: sa, canEnterMultiplierMode: cemm, paused: p, canUndo: cu })

    switch (action) {
      case 'make':
        if (ga) {
          console.log('[App] Executing makeShot()')
          ms()
        } else {
          console.log('[App] Ignored make - game not active')
        }
        break
      case 'miss':
        if (ga) {
          console.log('[App] Executing missShot()')
          miss()
        } else {
          console.log('[App] Ignored miss - game not active')
        }
        break
      case 'tip_make':
        if (ga) {
          console.log('[App] Executing tipInMakeShot()')
          tms()
        } else {
          console.log('[App] Ignored tip_make - game not active')
        }
        break
      case 'tip_miss':
        if (ga) {
          console.log('[App] Executing tipInMissShot()')
          tmiss()
        } else {
          console.log('[App] Ignored tip_miss - game not active')
        }
        break
      case 'enter_point_mode':
        if (ga && m === 'multiplier') {
          console.log('[App] Executing enterPointMode()')
          epm()
        } else {
          console.log('[App] Ignored enter_point_mode - conditions not met')
        }
        break
      case 'enter_multiplier_mode':
        if (ga && m === 'point' && cemm) {
          console.log('[App] Executing enterMultiplierMode()')
          emm()
        } else {
          console.log('[App] Ignored enter_multiplier_mode - conditions not met')
        }
        break
      case 'start_session':
        if (!sa) {
          console.log('[App] Executing startSession()')
          ss()
        } else {
          console.log('[App] Ignored start_session - session already active')
        }
        break
      case 'start_game':
        if (sa && !ga) {
          console.log('[App] Executing startNewGame()')
          sng()
        } else {
          console.log('[App] Ignored start_game - conditions not met')
        }
        break
      case 'end_session':
        if (sa) {
          console.log('[App] Executing endSession()')
          es()
        } else {
          console.log('[App] Ignored end_session - no active session')
        }
        break
      case 'pause':
      case 'resume':
        if (sa) {
          console.log('[App] Executing togglePause()')
          tp()
        } else {
          console.log('[App] Ignored pause/resume - no active session')
        }
        break
      case 'undo':
        if (ga && cu) {
          console.log('[App] Executing undo()')
          ud()
        } else {
          console.log('[App] Ignored undo - conditions not met')
        }
        break
      default:
        console.log('[App] Unknown action:', action)
        break
    }
  }, [])

  // Microphone selector
  const {
    devices: micDevices,
    selectedDeviceId: selectedMicId,
    selectDevice: selectMic,
    activateMicrophone,
    deactivateMicrophone,
    hasPermission: hasMicPermission,
    refreshDevices: refreshMics
  } = useMicrophoneSelector()

  const [showMicSettings, setShowMicSettings] = useState(false)

  const {
    isListening,
    isProcessing,
    isSupported,
    lastTranscript,
    lastAction,
    error: voiceError,
    toggleListening
  } = useVoiceControl(handleVoiceCommand, activateMicrophone, deactivateMicrophone)

  // Audio feedback for voice control
  const audioListeningRef = useRef(isListening)
  const audioProcessingRef = useRef(isProcessing)
  const audioLastActionRef = useRef(lastAction)

  useEffect(() => {
    if (isListening && !audioListeningRef.current) {
      playListeningStart()
    }
    audioListeningRef.current = isListening
  }, [isListening, playListeningStart])

  useEffect(() => {
    if (isProcessing && !audioProcessingRef.current) {
      playProcessing()
    }
    audioProcessingRef.current = isProcessing
  }, [isProcessing, playProcessing])

  useEffect(() => {
    if (lastAction && lastAction !== audioLastActionRef.current) {
      if (lastAction === 'unknown') {
        playCommandUnknown()
      } else {
        playCommandRecognized()
      }
    }
    audioLastActionRef.current = lastAction
  }, [lastAction, playCommandRecognized, playCommandUnknown])

  // Get selected mic label for display
  const getSelectedMicLabel = () => {
    if (!selectedMicId) return 'Default';
    const device = micDevices.find(d => d.deviceId === selectedMicId);
    return device?.label || 'Unknown';
  }

  // Common voice button props
  const voiceButtonProps = {
    isListening,
    isProcessing,
    isSupported,
    lastTranscript,
    lastAction,
    voiceError,
    toggleListening,
    showMicSettings,
    setShowMicSettings,
    refreshMics,
    hasMicPermission,
    micDevices,
    selectedMicId,
    selectMic,
    getSelectedMicLabel
  }

  // Loading screen while hydrating from server
  if (urlSessionId && (serverLoading || !hydrationComplete)) {
    return (
      <div className="app">
        <div className="pre-session">
          <h1>Loading...</h1>
          <p className="voice-hint">Restoring your session</p>
        </div>
      </div>
    )
  }

  // Error screen if session not found
  if (urlSessionId && serverError) {
    return (
      <div className="app">
        <div className="pre-session">
          <h1>Session Not Found</h1>
          <p className="voice-hint">{serverError}</p>
          <button className="start-button" onClick={() => navigate('/')}>
            Go Home
          </button>
        </div>
      </div>
    )
  }

  // Read-only view for ended sessions
  if (endedSessionData) {
    const { session, games } = endedSessionData
    return (
      <div className="app">
        <div className="pre-session ended-session">
          <h1>Session Complete</h1>
          <div className="session-date">
            {new Date(session.startedAt).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
          <div className="session-stats">
            <div className="stat-item">
              <span className="stat-value">{session.highScore}</span>
              <span className="stat-label">High Score</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{session.totalGames}</span>
              <span className="stat-label">Games</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{session.totalPoints}</span>
              <span className="stat-label">Total Points</span>
            </div>
          </div>
          {games && games.length > 0 && (
            <div className="games-breakdown">
              <h3>Games</h3>
              <div className="games-list">
                {games.map((game, index) => (
                  <div key={game.id} className="game-item">
                    <span className="game-number">#{index + 1}</span>
                    <span className="game-score">{game.finalScore} pts</span>
                    <span className="game-multiplier">{game.highMultiplier}x max</span>
                    <span className="game-stats">{game.totalMakes} makes, {game.totalMisses} misses</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="start-button" onClick={() => navigate('/')}>
            Start New Session
          </button>
        </div>
      </div>
    )
  }

  // Pre-session screen
  if (!sessionActive) {
    return (
      <div className="app">
        <div className="pre-session">
          <h1>Living Room Basketball Challenge</h1>
          {sessionEndedByTimer && (
            <div className="session-complete-banner">Session Complete!</div>
          )}
          {sessionHighScore > 0 && (
            <div className="final-score">
              <span className="label">{sessionEndedByTimer ? 'Final Score' : 'Session Score'}</span>
              <span className="value">{score > 0 ? score : sessionHighScore}</span>
            </div>
          )}
          {sessionEndedByTimer && sessionHighScore > 0 && score !== sessionHighScore && (
            <div className="high-score">
              <span className="label">Session High</span>
              <span className="value">{sessionHighScore}</span>
            </div>
          )}
          {finalShotAvailable && (
            <div className="final-shot-section">
              <p className="final-shot-prompt">Did your last shot count?</p>
              <div className="final-shot-buttons">
                <button className="action-btn make-btn" onClick={handleFinalMake}>
                  MAKE
                </button>
                <button className="action-btn miss-btn" onClick={handleFinalMiss}>
                  MISS
                </button>
              </div>
            </div>
          )}
          <button className="start-button" onClick={startSession}>
            Start 10-Minute Session
          </button>
          <Link to="/history" className="history-button">
            View History
          </Link>
          <VoiceButton {...voiceButtonProps} />
          <p className="voice-hint">
            Voice commands: "start", "make", "miss", "point mode", "multiplier mode"
          </p>
        </div>
      </div>
    )
  }

  // Game over (within session) - can start new game
  if (!gameActive && sessionActive) {
    return (
      <div className="app">
        <div className="game-over">
          <div className="timer">{formatTime(timeRemaining)}</div>
          <h2>Game Over!</h2>
          <div className="score-display">
            <span className="label">Final Score</span>
            <span className="value">{score}</span>
          </div>
          <div className="high-score">
            <span className="label">Session High</span>
            <span className="value">{sessionHighScore}</span>
          </div>
          <div className="game-over-buttons">
            <button className="start-button" onClick={startNewGame}>
              New Game
            </button>
            <button className="end-session-button" onClick={endSession}>
              End Session
            </button>
          </div>
          <VoiceButton {...voiceButtonProps} />
        </div>
      </div>
    )
  }

  // Active gameplay - mode class on app for background color shift
  return (
    <div className={`app gameplay mode-${mode}`}>
      <div className="scoreboard">
        {/* Timer row */}
        <div className={`timer-row ${paused ? 'paused' : ''}`}>
          <span className="timer-value">{formatTime(timeRemaining)}</span>
        </div>

        {/* Paused overlay */}
        {paused && (
          <div className="paused-indicator">PAUSED</div>
        )}

        {/* Mode indicator - large and prominent */}
        <div className={`mode-banner ${mode}`}>
          {mode === 'multiplier' ? 'MULTIPLIER MODE' : 'POINT MODE'}
        </div>

        {/* Main score display */}
        <div className="main-score">
          <span className="score">{score}</span>
        </div>

        {/* Key stats - centered */}
        <div className="key-stats">
          {/* Multiplier */}
          <div className="key-stat multiplier-stat">
            <span className="key-stat-value">{multiplier}x</span>
            <span className="key-stat-label">multiplier</span>
          </div>

          {/* Lives - shows number when >3, dots otherwise */}
          <div className="key-stat lives-stat">
            {misses > 3 ? (
              <span className="lives-number">{misses}</span>
            ) : (
              <div className="lives-visual">
                {[...Array(3)].map((_, i) => (
                  <span
                    key={i}
                    className={`life-dot ${i < misses ? 'active' : 'used'}`}
                  >
                    ●
                  </span>
                ))}
              </div>
            )}
            <span className="key-stat-label">lives</span>
          </div>
        </div>

        {/* Bonus indicators */}
        {(multiplierShotsRemaining > 0 || freebiesRemaining > 0) && (
          <div className="bonus-row">
            {mode === 'point' && multiplierShotsRemaining > 0 && (
              <div className="bonus-item multiplier-shots-bonus">
                <span className="bonus-value">{multiplierShotsRemaining}</span>
                <span className="bonus-label">{multiplier}x shots left</span>
              </div>
            )}
            {freebiesRemaining > 0 && (
              <div className="bonus-item freebies-bonus">
                <span className="bonus-value">{freebiesRemaining}</span>
                <span className="bonus-label">freebies</span>
              </div>
            )}
          </div>
        )}

        {/* Session high - subtle */}
        <div className="session-high-inline">
          High: {sessionHighScore}
        </div>
      </div>

      {/* Controls - fixed at bottom */}
      <div className="controls-bar">
        {/* Mode switch prompt when available */}
        {mode === 'point' && canEnterMultiplierMode && (
          <button className="mode-switch-btn" onClick={enterMultiplierMode}>
            ✨ MULTIPLIER MODE
          </button>
        )}

        {/* Main action buttons */}
        <div className="action-row">
          <button className="action-btn make-btn" onClick={makeShot}>
            MAKE
          </button>
          <button className="action-btn miss-btn" onClick={trackedMissShot}>
            MISS
          </button>
        </div>

        {/* Secondary controls row */}
        <div className="secondary-row">
          {mode === 'multiplier' && (
            <button className="secondary-btn mode-btn" onClick={enterPointMode}>
              → POINTS
            </button>
          )}
          <button className="secondary-btn pause-btn" onClick={togglePause}>
            {paused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
          <button
            className={`secondary-btn undo-btn ${canUndo ? '' : 'disabled'}`}
            onClick={undoWithSound}
            disabled={!canUndo}
          >
            ↩ UNDO
          </button>
          <VoiceButton {...voiceButtonProps} compact />
        </div>
      </div>
    </div>
  )
}

// Main App component with routing
function App() {
  return (
    <Routes>
      <Route path="/" element={<GameSession />} />
      <Route path="/session/:sessionId" element={<GameSession />} />
      <Route path="/history" element={<History />} />
    </Routes>
  )
}

export default App
