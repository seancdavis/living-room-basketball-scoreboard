import { useState, useCallback, useRef, useEffect } from 'react';

export function useVoiceControl(onCommand, activateMicrophone, deactivateMicrophone) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const [lastAction, setLastAction] = useState(null);
  const [error, setError] = useState(null);
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);

  // Use ref to avoid stale closure in recognition callbacks
  const onCommandRef = useRef(onCommand);

  // Keep ref updated with latest onCommand callback
  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  // Clear feedback after a delay
  const clearFeedback = useCallback(() => {
    if (feedbackTimeoutRef.current) {
      clearTimeout(feedbackTimeoutRef.current);
    }
    feedbackTimeoutRef.current = setTimeout(() => {
      setLastTranscript('');
      setLastAction(null);
    }, 3000);
  }, []);

  // Check for browser support
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      setError('Speech recognition not supported in this browser');
    }
  }, []);

  // Process transcript with AI
  const processTranscript = useCallback(async (transcript) => {
    if (!transcript.trim()) return;

    console.log('[Voice] Processing transcript:', transcript);
    setIsProcessing(true);
    setLastTranscript(transcript);

    try {
      console.log('[Voice] Calling voice-command API...');
      const response = await fetch('/api/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });

      const result = await response.json();
      console.log('[Voice] API response:', result);

      if (result.error && !result.action) {
        console.log('[Voice] Error from API:', result.error);
        setError(result.error);
        setLastAction(null);
      } else {
        setLastAction(result);
        setError(null);

        // Only execute if confidence is high enough
        if (result.action !== 'unknown' && result.confidence >= 0.5) {
          console.log('[Voice] Executing action:', result.action);
          onCommandRef.current?.(result.action);
        } else {
          console.log('[Voice] Action not executed - unknown or low confidence:', result);
        }
      }

      // Clear feedback after delay
      clearFeedback();
    } catch (err) {
      console.error('[Voice] Fetch error:', err);
      setError(err.message);
      setLastAction(null);
      clearFeedback();
    } finally {
      setIsProcessing(false);
    }
  }, [clearFeedback]);

  // Start listening
  const startListening = useCallback(async () => {
    if (!isSupported) return;

    // Activate the selected microphone before starting recognition
    // This is required for browsers like Arc that need explicit mic permission
    if (activateMicrophone) {
      const micActivated = await activateMicrophone();
      if (!micActivated) {
        setError('Failed to access microphone. Check permissions in browser settings.');
        return;
      }
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('[Voice] Recognition started, listening...');
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript;
      const confidence = event.results[last][0].confidence;
      console.log('[Voice] Heard:', transcript, '(confidence:', confidence, ')');
      processTranscript(transcript);
    };

    recognition.onerror = (event) => {
      console.log('[Voice] Recognition error:', event.error, event);
      if (event.error === 'no-speech') {
        // This is normal, just no speech detected
        return;
      }
      if (event.error === 'aborted') {
        // User or system aborted, not an error
        return;
      }
      if (event.error === 'network') {
        // Network error typically means browser is blocking speech recognition servers
        // Common in privacy-focused browsers like Arc, Brave, etc.
        setError('Speech recognition blocked by browser. Try Chrome or Safari.');
      } else if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please allow microphone in browser settings.');
      } else if (event.error === 'audio-capture') {
        setError('No microphone found or microphone is in use by another app.');
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      // Restart if we're still supposed to be listening
      if (recognitionRef.current === recognition) {
        // Safari requires a small delay before restarting speech recognition
        // Without this delay, Safari throws "The string did not match the expected pattern"
        setTimeout(() => {
          // Check again after delay since user may have stopped listening
          if (recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch (err) {
              console.log('[Voice] Failed to restart recognition:', err.message);
              // On Safari, this error often means speech recognition service isn't available
              // Check if it's the Safari-specific pattern match error
              if (err.message?.includes('string did not match')) {
                setError('Speech recognition unavailable. Enable Dictation in System Preferences > Keyboard.');
              }
              setIsListening(false);
              recognitionRef.current = null;
            }
          }
        }, 100);
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      // Safari throws "The string did not match the expected pattern" when
      // Dictation isn't enabled or speech recognition service is unavailable
      if (err.message?.includes('string did not match')) {
        setError('Speech recognition unavailable. Enable Dictation in System Preferences > Keyboard.');
      } else {
        setError(`Failed to start: ${err.message}`);
      }
      recognitionRef.current = null;
      if (deactivateMicrophone) {
        deactivateMicrophone();
      }
    }
  }, [isSupported, processTranscript, activateMicrophone, deactivateMicrophone]);

  // Stop listening
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      recognition.stop();
    }
    // Release the microphone stream
    if (deactivateMicrophone) {
      deactivateMicrophone();
    }
    setIsListening(false);
  }, [deactivateMicrophone]);

  // Toggle listening
  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  return {
    isListening,
    isProcessing,
    isSupported,
    lastTranscript,
    lastAction,
    error,
    startListening,
    stopListening,
    toggleListening
  };
}
