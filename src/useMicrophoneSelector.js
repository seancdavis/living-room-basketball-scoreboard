import { useState, useEffect, useCallback } from 'react';

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

  // Activate the selected microphone (call before starting speech recognition)
  const activateMicrophone = useCallback(async () => {
    if (!selectedDeviceId) return true; // Use default

    try {
      // Request the specific microphone - this sets it as active
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: selectedDeviceId } }
      });
      // Keep the stream active briefly, then release
      // The speech recognition should pick up the active device
      setTimeout(() => {
        stream.getTracks().forEach(track => track.stop());
      }, 100);
      return true;
    } catch (err) {
      console.error('Failed to activate microphone:', err);
      return false;
    }
  }, [selectedDeviceId]);

  return {
    devices,
    selectedDeviceId,
    selectDevice,
    activateMicrophone,
    refreshDevices,
    isLoading,
    error,
    hasPermission
  };
}
