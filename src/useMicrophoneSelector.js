import { useState, useEffect, useCallback, useRef } from 'react';

const STORAGE_KEY = 'preferred-microphone-id';

export function useMicrophoneSelector() {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || '';
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hasPermission, setHasPermission] = useState(false);

  // Request permission and enumerate devices
  const refreshDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Request microphone permission first (required to get device labels)
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setHasPermission(true);

      // Now enumerate devices
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter(device => device.kind === 'audioinput');

      setDevices(audioInputs);

      // If selected device no longer exists, clear selection
      if (selectedDeviceId && !audioInputs.find(d => d.deviceId === selectedDeviceId)) {
        setSelectedDeviceId('');
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied');
      } else {
        setError(err.message);
      }
      setHasPermission(false);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId]);

  // Initial load
  useEffect(() => {
    refreshDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  // Select a device
  const selectDevice = useCallback((deviceId) => {
    setSelectedDeviceId(deviceId);
    if (deviceId) {
      localStorage.setItem(STORAGE_KEY, deviceId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Active stream ref - keeps mic "warm" while speech recognition is active
  const activeStreamRef = useRef(null);

  // Activate the selected microphone (call before starting speech recognition)
  // Returns a cleanup function to release the stream
  const activateMicrophone = useCallback(async () => {
    // Release any existing stream first
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }

    try {
      // Always request microphone permission - this is required for Web Speech API
      // in some browsers (like Arc) even when using the default device
      const constraints = selectedDeviceId
        ? { audio: { deviceId: { exact: selectedDeviceId } } }
        : { audio: true };

      console.log('[Mic] Requesting microphone access:', selectedDeviceId || 'default');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Keep the stream active - this helps ensure the mic stays "warm"
      // for speech recognition in browsers like Arc
      activeStreamRef.current = stream;
      console.log('[Mic] Microphone activated successfully');

      return true;
    } catch (err) {
      console.error('[Mic] Failed to activate microphone:', err);
      // If exact device fails, try falling back to default
      if (selectedDeviceId && err.name === 'OverconstrainedError') {
        console.log('[Mic] Falling back to default microphone');
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          activeStreamRef.current = stream;
          return true;
        } catch (fallbackErr) {
          console.error('[Mic] Fallback also failed:', fallbackErr);
        }
      }
      return false;
    }
  }, [selectedDeviceId]);

  // Deactivate the microphone (call when stopping speech recognition)
  const deactivateMicrophone = useCallback(() => {
    if (activeStreamRef.current) {
      console.log('[Mic] Releasing microphone stream');
      activeStreamRef.current.getTracks().forEach(track => track.stop());
      activeStreamRef.current = null;
    }
  }, []);

  return {
    devices,
    selectedDeviceId,
    selectDevice,
    activateMicrophone,
    deactivateMicrophone,
    refreshDevices,
    isLoading,
    error,
    hasPermission
  };
}
