'use client';

import { useEffect } from 'react';
import { onForegroundMessage } from '@/lib/firebase/messaging';

/**
 * Component to register service worker for push notifications
 * This should be added to the root layout
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported in this browser');
      return;
    }

    const registerSW = () => {
      // Prevent registering if the document is being unloaded
      if ((document.readyState as string) === 'uninitialized') return;

      navigator.serviceWorker
        .register('/firebase-messaging-sw.js')
        .then((registration) => {
          console.log('[SUCCESS] Service Worker registered successfully:', registration.scope);
        })
        .catch((error) => {
          // Ignore registration failures during HMR/unload states
          if (error.name === 'InvalidStateError') {
            console.warn('[INFO] Service Worker registration deferred due to document state.');
          } else {
            console.error('[ERROR] Service Worker registration failed:', error);
          }
        });
    };

    // Delay registration until page has fully loaded
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => window.removeEventListener('load', registerSW);
    }
  }, []);

  useEffect(() => {
    // Listen for foreground messages (when app is open)
    onForegroundMessage((payload) => {
      console.log('[INFO] Received foreground message:', payload);
      
      // You can show a toast notification here
      // or update UI based on the notification
    });
  }, []);

  // This component doesn't render anything
  return null;
}
