import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import './History.css'

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isSessionInProgress(session) {
  // If endedAt is set, session is definitely ended
  if (session.endedAt) {
    return false
  }

  // Calculate elapsed time to see if session would still be active
  const now = Date.now()
  const startedAtMs = new Date(session.startedAt).getTime()
  const durationMs = (session.durationSeconds || 600) * 1000
  const totalPausedMs = session.totalPausedMs || 0

  let elapsedMs
  if (session.isPaused && session.pausedAt) {
    // If paused, calculate elapsed up to pause time
    elapsedMs = new Date(session.pausedAt).getTime() - startedAtMs - totalPausedMs
  } else {
    // If running, calculate elapsed up to now
    elapsedMs = now - startedAtMs - totalPausedMs
  }

  // Session is in progress if elapsed time is less than duration
  return elapsedMs < durationMs
}

function History() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/session')
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      setSessions(data.sessions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const handleDelete = async (sessionId) => {
    if (confirmDelete !== sessionId) {
      setConfirmDelete(sessionId)
      return
    }

    try {
      setDeleting(sessionId)
      const response = await fetch(`/api/session?id=${sessionId}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (data.error) {
        throw new Error(data.error)
      }
      // Remove from local state
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      setConfirmDelete(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(null)
    }
  }

  const cancelDelete = () => {
    setConfirmDelete(null)
  }

  return (
    <div className="history-page">
      <div className="history-container">
        <div className="history-header">
          <Link to="/" className="back-link">← Back</Link>
          <h1>Session History</h1>
        </div>

        {loading && (
          <div className="history-loading">Loading...</div>
        )}

        {error && (
          <div className="history-error">{error}</div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="history-empty">No sessions yet. Start playing!</div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="history-list">
            {sessions.map(session => (
              <div key={session.id} className="session-card">
                <div className="session-info">
                  <div className="session-date">
                    {formatDate(session.startedAt)}
                  </div>
                  <div className="session-stats">
                    <span className="stat">
                      <span className="stat-value">{session.highScore}</span>
                      <span className="stat-label">high</span>
                    </span>
                    <span className="stat">
                      <span className="stat-value">{session.totalGames}</span>
                      <span className="stat-label">games</span>
                    </span>
                    <span className="stat">
                      <span className="stat-value">{session.totalPoints}</span>
                      <span className="stat-label">total pts</span>
                    </span>
                  </div>
                  {isSessionInProgress(session) && (
                    <div className="session-status">In Progress</div>
                  )}
                </div>
                <div className="session-actions">
                  {confirmDelete === session.id ? (
                    <div className="confirm-delete">
                      <span>Delete?</span>
                      <button
                        className="confirm-yes"
                        onClick={() => handleDelete(session.id)}
                        disabled={deleting === session.id}
                      >
                        {deleting === session.id ? '...' : 'Yes'}
                      </button>
                      <button
                        className="confirm-no"
                        onClick={cancelDelete}
                        disabled={deleting === session.id}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      className="delete-btn"
                      onClick={() => handleDelete(session.id)}
                      title="Delete session"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default History
