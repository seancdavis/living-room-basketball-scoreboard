import { useGameState } from './useGameState'
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
          <button className="start-button" onClick={startNewGame}>
            New Game
          </button>
          <button className="end-session-button" onClick={endSession}>
            End Session
          </button>
        </div>
      </div>
    )
  }

  // Active gameplay
  return (
    <div className="app">
      <div className="scoreboard">
        {/* Header */}
        <div className="header">
          <div className="timer">{formatTime(timeRemaining)}</div>
          <div className="session-high">
            <span className="label">High</span>
            <span className="value">{sessionHighScore}</span>
          </div>
        </div>

        {/* Main score display */}
        <div className="main-score">
          <span className="score">{score}</span>
        </div>

        {/* Mode indicator */}
        <div className={`mode-indicator ${mode}`}>
          {mode === 'multiplier' ? 'MULTIPLIER MODE' : 'POINT MODE'}
        </div>

        {/* Stats row */}
        <div className="stats-row">
          <div className="stat">
            <span className="label">Multiplier</span>
            <span className="value">{multiplier}x</span>
          </div>
          <div className="stat">
            <span className="label">Misses</span>
            <span className="value misses">{misses}</span>
          </div>
          {mode === 'point' && multiplierShotsRemaining > 0 && (
            <div className="stat">
              <span className="label">Multi Shots</span>
              <span className="value">{multiplierShotsRemaining}</span>
            </div>
          )}
          {mode === 'point' && freebiesRemaining > 0 && (
            <div className="stat">
              <span className="label">Freebies</span>
              <span className="value freebies">{freebiesRemaining}</span>
            </div>
          )}
        </div>

        {/* Shot buttons */}
        <div className="shot-buttons">
          <button className="shot-button make" onClick={makeShot}>
            MAKE
          </button>
          <button className="shot-button miss" onClick={missShot}>
            MISS
          </button>
        </div>

        {/* Mode switching */}
        <div className="mode-actions">
          {mode === 'multiplier' && (
            <button className="mode-button" onClick={enterPointMode}>
              Enter Point Mode
            </button>
          )}
          {mode === 'point' && canEnterMultiplierMode && (
            <button className="mode-button highlight" onClick={enterMultiplierMode}>
              Enter Multiplier Mode
            </button>
          )}
        </div>

        {/* Info text */}
        {mode === 'point' && canEnterMultiplierMode && (
          <p className="info-text">
            You just passed a multiple of 10! You can enter Multiplier Mode now, or continue shooting to forfeit this opportunity.
          </p>
        )}
      </div>
    </div>
  )
}

export default App
