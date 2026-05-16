import { useState, useEffect, useCallback } from 'react';

export function usePedometer(onStep: () => void) {
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'default' | 'granted' | 'denied'>('default');

  const requestPermission = async () => {
    // @ts-ignore
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        // @ts-ignore
        const response = await DeviceMotionEvent.requestPermission();
        if (response === 'granted') {
          setPermissionStatus('granted');
          return true;
        } else {
          setPermissionStatus('denied');
          setError('Permission denied for motion sensors.');
          return false;
        }
      } catch (err) {
        setError('Error requesting motion permission.');
        return false;
      }
    }
    // For non-iOS or browsers that don't need explicit permission prompt
    setPermissionStatus('granted');
    return true;
  };

  const startTracking = async () => {
    const granted = await requestPermission();
    if (granted) {
      setIsActive(true);
    }
  };

  const stopTracking = () => {
    setIsActive(false);
  };

  useEffect(() => {
    if (!isActive) return;

    let lastStepTime = Date.now();
    const STEP_THRESHOLD = 12.0; // Magnitude threshold for a step
    const MIN_STEP_INTERVAL = 250; // ms between steps
    const SMOOTHING_FACTOR = 0.8;
    let smoothedValue = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      // Calculate magnitude
      const magnitude = Math.sqrt(acc.x ** 2 + acc.y ** 2 + acc.z ** 2);
      
      // Simple low-pass filter
      smoothedValue = smoothedValue * SMOOTHING_FACTOR + magnitude * (1 - SMOOTHING_FACTOR);

      const now = Date.now();
      if (smoothedValue > STEP_THRESHOLD && now - lastStepTime > MIN_STEP_INTERVAL) {
        onStep();
        lastStepTime = now;
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isActive, onStep]);

  return { isActive, startTracking, stopTracking, error, permissionStatus };
}
