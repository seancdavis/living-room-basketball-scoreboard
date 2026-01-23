import { useCallback, useState, useRef, useEffect } from 'react'
import { useGameState } from './useGameState'
import { useVoiceControl } from './useVoiceControl'
import { useMicrophoneSelector } from './useMicrophoneSelector'
import { useGameTracking } from './useGameTracking'
import VoiceButton from './VoiceButton'
import './App.css'

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function App() {
  const {
    sessionActive,
    timeRemaining,
    sessionHighScore,
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
    makeShot,
    missShot,
    enterPointMode,
    enterMultiplierMode,
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
  } = useGameTracking()

  // Track game count and total points for session stats
  const gameCountRef = useRef(0)
  const totalPointsRef = useRef(0)
  const prevScoreRef = useRef(0)

  // Wrapped miss action that includes tracking
  const prevMissesRef = useRef(misses)
  const prevFreebiesRef = useRef(freebiesRemaining)
  const trackingMissRef = useRef(false)

  const trackedMissShot = useCallback(() => {
    trackingMissRef.current = true
    missShot()
  }, [missShot])

  // Use refs to avoid stale closures in voice command handler
  const gameStateRef = useRef({ gameActive, mode, sessionActive, canEnterMultiplierMode })
  const actionsRef = useRef({ makeShot, missShot: trackedMissShot, enterPointMode, enterMultiplierMode, startSession, startNewGame, endSession })

  useEffect(() => {
    gameStateRef.current = { gameActive, mode, sessionActive, canEnterMultiplierMode }
  }, [gameActive, mode, sessionActive, canEnterMultiplierMode])

  useEffect(() => {
    actionsRef.current = { makeShot, missShot: trackedMissShot, enterPointMode, enterMultiplierMode, startSession, startNewGame, endSession }
  }, [makeShot, trackedMissShot, enterPointMode, enterMultiplierMode, startSession, startNewGame, endSession])

  // Track session lifecycle
  const prevSessionActiveRef = useRef(false)
  useEffect(() => {
    const wasActive = prevSessionActiveRef.current
    prevSessionActiveRef.current = sessionActive

    if (sessionActive && !wasActive) {
      // Session just started
      gameCountRef.current = 0
      totalPointsRef.current = 0
      createSession()
    } else if (!sessionActive && wasActive) {
      // Session just ended
      endSessionTracking(sessionHighScore, totalPointsRef.current, gameCountRef.current)
    }
  }, [sessionActive, sessionHighScore, createSession, endSessionTracking])

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

  // Track score changes (makes)
  useEffect(() => {
    if (!gameActive) return
    const prevScore = prevScoreRef.current
    if (score > prevScore) {
      const pointsEarned = score - prevScore
      recordMake({
        score,
        multiplier,
        multiplierShotsRemaining,
        misses,
        freebiesRemaining,
        mode,
        pointsEarned,
      })
    }
    prevScoreRef.current = score
  }, [score, gameActive, multiplier, multiplierShotsRemaining, misses, freebiesRemaining, mode, recordMake])

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

    recordMiss({
      score,
      multiplier,
      multiplierShotsRemaining,
      misses,
      freebiesRemaining,
      mode,
    }, usedFreebie)

    prevMissesRef.current = misses
    prevFreebiesRef.current = freebiesRemaining
  }, [gameActive, misses, freebiesRemaining, score, multiplier, multiplierShotsRemaining, mode, recordMiss])

  // Handle voice commands - uses refs to always have current state
  const handleVoiceCommand = useCallback((action) => {
    const { gameActive: ga, mode: m, sessionActive: sa, canEnterMultiplierMode: cemm } = gameStateRef.current
    const { makeShot: ms, missShot: miss, enterPointMode: epm, enterMultiplierMode: emm, startSession: ss, startNewGame: sng, endSession: es } = actionsRef.current

    console.log('[App] Voice command received:', action, { gameActive: ga, mode: m, sessionActive: sa, canEnterMultiplierMode: cemm })

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
  } = useVoiceControl(handleVoiceCommand, activateMicrophone)

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

  // Pre-session screen
  if (!sessionActive) {
    return (
      <div className="app">
        <div className="pre-session">
          <h1>Living Room Basketball Challenge</h1>
          {sessionHighScore > 0 && (
            <div className="final-score">
              <span className="label">Session Score</span>
              <span className="value">{sessionHighScore}</span>
            </div>
          )}
          <button className="start-button" onClick={startSession}>
            Start 10-Minute Session
          </button>
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

  // Active gameplay
  return (
    <div className="app gameplay">
      <div className="scoreboard">
        {/* Timer - large and prominent */}
        <div className="timer-display">
          <span className="timer-value">{formatTime(timeRemaining)}</span>
        </div>

        {/* Main score display */}
        <div className="main-score">
          <span className="score">{score}</span>
        </div>

        {/* Mode indicator */}
        <div className={`mode-indicator ${mode}`}>
          {mode === 'multiplier' ? 'MULTIPLIER' : 'POINT MODE'}
        </div>

        {/* Key stats - large and visual */}
        <div className="key-stats">
          {/* Multiplier */}
          <div className="key-stat multiplier-stat">
            <span className="key-stat-value">{multiplier}x</span>
            <span className="key-stat-label">multiplier</span>
          </div>

          {/* Misses - visual circles */}
          <div className="key-stat misses-stat">
            <div className="misses-visual">
              {[...Array(3)].map((_, i) => (
                <span
                  key={i}
                  className={`miss-dot ${i < misses ? 'active' : 'used'}`}
                >
                  ●
                </span>
              ))}
            </div>
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

        {/* Mode switch prompt */}
        {mode === 'point' && canEnterMultiplierMode && (
          <button className="mode-switch-prompt" onClick={enterMultiplierMode}>
            ✨ Enter Multiplier Mode
          </button>
        )}

        {/* Action buttons - smaller, at bottom */}
        <div className="action-buttons">
          <button className="action-btn make-btn" onClick={makeShot}>
            MAKE
          </button>
          <button className="action-btn miss-btn" onClick={trackedMissShot}>
            MISS
          </button>
          {mode === 'multiplier' && (
            <button className="action-btn mode-btn" onClick={enterPointMode}>
              → POINTS
            </button>
          )}
        </div>

        {/* Minimal footer with voice and session high */}
        <div className="scoreboard-footer">
          <div className="session-high-mini">
            High: {sessionHighScore}
          </div>
          <VoiceButton {...voiceButtonProps} compact />
        </div>
      </div>
    </div>
  )
}

export default App
