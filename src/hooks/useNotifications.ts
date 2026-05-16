import { useState, useCallback, useEffect } from 'react';

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'denied';
    
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, []);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      // In-app fallback log or state can be handled here
      console.log('Notification (in-app fallback):', title, options);
      return false;
    }

    try {
      new Notification(title, {
        icon: '/favicon.ico', // Default icon
        ...options
      });
      return true;
    } catch (err) {
      console.error('Failed to send notification:', err);
      return false;
    }
  }, []);

  return { permission, requestPermission, sendNotification };
}
