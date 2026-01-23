import { useCallback, useRef } from 'react';

// Web Audio API-based sound effects - no external files needed
export function useAudioFeedback() {
  const audioContextRef = useRef(null);

  // Get or create AudioContext (lazy init for browser autoplay policies)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Play a tone with given frequency, duration, and type
  const playTone = useCallback((frequency, duration = 0.15, type = 'sine', volume = 0.3) => {
    try {
      const ctx = getAudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

      // Envelope: quick attack, sustain, quick release
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(volume * 0.7, ctx.currentTime + duration * 0.7);
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }
  }, [getAudioContext]);

  // Play a sequence of tones
  const playSequence = useCallback((notes) => {
    let offset = 0;
    notes.forEach(({ frequency, duration = 0.1, delay = 0, type = 'sine', volume = 0.3 }) => {
      setTimeout(() => {
        playTone(frequency, duration, type, volume);
      }, (offset + delay) * 1000);
      offset += duration + delay;
    });
  }, [playTone]);

  // === Sound Effects ===

  // Make shot - cheerful ascending tone
  const playMake = useCallback(() => {
    playSequence([
      { frequency: 523.25, duration: 0.08, volume: 0.25 }, // C5
      { frequency: 659.25, duration: 0.12, volume: 0.3 },  // E5
    ]);
  }, [playSequence]);

  // Miss shot - descending tone
  const playMiss = useCallback(() => {
    playSequence([
      { frequency: 349.23, duration: 0.1, volume: 0.2 },  // F4
      { frequency: 293.66, duration: 0.15, volume: 0.25 }, // D4
    ]);
  }, [playSequence]);

  // Mode change to point mode - warm rising arpeggio
  const playPointMode = useCallback(() => {
    playSequence([
      { frequency: 392, duration: 0.08, volume: 0.2 },    // G4
      { frequency: 493.88, duration: 0.08, delay: 0.02, volume: 0.25 }, // B4
      { frequency: 587.33, duration: 0.15, delay: 0.02, volume: 0.3 },  // D5
    ]);
  }, [playSequence]);

  // Mode change to multiplier mode - power-up sound
  const playMultiplierMode = useCallback(() => {
    playSequence([
      { frequency: 261.63, duration: 0.08, type: 'square', volume: 0.15 }, // C4
      { frequency: 329.63, duration: 0.08, delay: 0.02, type: 'square', volume: 0.18 }, // E4
      { frequency: 392, duration: 0.08, delay: 0.02, type: 'square', volume: 0.2 },     // G4
      { frequency: 523.25, duration: 0.15, delay: 0.02, type: 'square', volume: 0.22 }, // C5
    ]);
  }, [playSequence]);

  // Voice listening started - soft click
  const playListeningStart = useCallback(() => {
    playTone(880, 0.05, 'sine', 0.15); // A5
  }, [playTone]);

  // Voice processing - thinking beep
  const playProcessing = useCallback(() => {
    playSequence([
      { frequency: 440, duration: 0.05, volume: 0.1 },
      { frequency: 440, duration: 0.05, delay: 0.08, volume: 0.1 },
    ]);
  }, [playSequence]);

  // Command recognized - confirmation
  const playCommandRecognized = useCallback(() => {
    playTone(784, 0.1, 'sine', 0.2); // G5
  }, [playTone]);

  // Command not recognized - error tone
  const playCommandUnknown = useCallback(() => {
    playSequence([
      { frequency: 200, duration: 0.1, type: 'sawtooth', volume: 0.15 },
      { frequency: 180, duration: 0.15, delay: 0.02, type: 'sawtooth', volume: 0.12 },
    ]);
  }, [playSequence]);

  // Game over - sad descending
  const playGameOver = useCallback(() => {
    playSequence([
      { frequency: 392, duration: 0.2, volume: 0.25 },    // G4
      { frequency: 349.23, duration: 0.2, delay: 0.05, volume: 0.22 }, // F4
      { frequency: 293.66, duration: 0.3, delay: 0.05, volume: 0.2 },  // D4
    ]);
  }, [playSequence]);

  // Passed a 10 - celebration
  const playPassedTen = useCallback(() => {
    playSequence([
      { frequency: 523.25, duration: 0.1, volume: 0.25 }, // C5
      { frequency: 659.25, duration: 0.1, delay: 0.02, volume: 0.28 }, // E5
      { frequency: 783.99, duration: 0.1, delay: 0.02, volume: 0.3 },  // G5
      { frequency: 1046.5, duration: 0.2, delay: 0.02, volume: 0.35 }, // C6
    ]);
  }, [playSequence]);

  // Pause/Resume - click
  const playPauseToggle = useCallback(() => {
    playTone(600, 0.08, 'triangle', 0.2);
  }, [playTone]);

  return {
    playMake,
    playMiss,
    playPointMode,
    playMultiplierMode,
    playListeningStart,
    playProcessing,
    playCommandRecognized,
    playCommandUnknown,
    playGameOver,
    playPassedTen,
    playPauseToggle,
  };
}
