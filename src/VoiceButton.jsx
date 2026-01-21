import { useRef, useEffect } from 'react'

function VoiceButton({
  compact = false,
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
}) {
  const dropdownRef = useRef(null)
  const settingsButtonRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMicSettings) return

    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        settingsButtonRef.current &&
        !settingsButtonRef.current.contains(event.target)
      ) {
        setShowMicSettings(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMicSettings, setShowMicSettings])

  return (
    <div className={`voice-control ${compact ? 'compact' : ''}`}>
      <div className="voice-button-row">
        <button
          className={`voice-button ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`}
          onClick={toggleListening}
          disabled={!isSupported}
          title={isSupported ? (isListening ? 'Stop voice control' : 'Start voice control') : 'Voice not supported'}
        >
          <span className="voice-icon">{isListening ? '🎤' : '🎙️'}</span>
          {!compact && (
            <span className="voice-label">
              {!isSupported ? 'Not Supported' : isProcessing ? 'Processing...' : isListening ? 'Listening' : 'Voice'}
            </span>
          )}
        </button>
        <button
          ref={settingsButtonRef}
          className="mic-settings-button"
          onClick={() => setShowMicSettings(!showMicSettings)}
          title="Microphone settings"
        >
          <span className="settings-icon">⚙️</span>
        </button>
      </div>

      {showMicSettings && (
        <div className="mic-settings-dropdown" ref={dropdownRef}>
          <div className="mic-settings-header">
            <span>Select Microphone</span>
            <button className="mic-refresh" onClick={refreshMics} title="Refresh devices">↻</button>
          </div>
          {!hasMicPermission ? (
            <div className="mic-permission-prompt">
              <p>Microphone permission required</p>
              <button onClick={refreshMics}>Grant Permission</button>
            </div>
          ) : micDevices.length === 0 ? (
            <div className="mic-empty">No microphones found</div>
          ) : (
            <select
              value={selectedMicId}
              onChange={(e) => selectMic(e.target.value)}
              className="mic-select"
            >
              <option value="">System Default</option>
              {micDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
          {selectedMicId && (
            <div className="mic-current">Using: {getSelectedMicLabel()}</div>
          )}
        </div>
      )}

      {isListening && lastTranscript && (
        <div className="voice-feedback">
          <span className="transcript">"{lastTranscript}"</span>
          {lastAction && (
            <span className={`action ${lastAction.action === 'unknown' ? 'unknown' : 'recognized'}`}>
              → {lastAction.action}
            </span>
          )}
        </div>
      )}
      {voiceError && <div className="voice-error">{voiceError}</div>}
    </div>
  )
}

export default VoiceButton
