/**
 * PushNotificationContext
 *
 * Mounts inside AuthProvider. On every auth state change:
 *   • Registers the device for push notifications and saves the token.
 *   • On logout, removes the token from the DB.
 *   • Attaches foreground / background notification listeners so tapping
 *     a notification navigates to the correct screen.
 *
 * All Notifications API calls are deferred until after the React-Native
 * bridge is fully ready (via addNotificationListeners / registerForPushNotifications)
 * to avoid the "push notification error on load" with newArchEnabled: true.
 */
import React, { createContext, useContext, useEffect, useRef } from 'react';
import {
  registerForPushNotifications,
  unregisterPushToken,
  addNotificationListeners,
} from '../services/pushNotifications';
import { useAuth } from './AuthContext';

const PushContext = createContext(null);

export function PushNotificationProvider({ children, navigationRef }) {
  const { user, isGuest } = useAuth();
  const cleanupRef = useRef(null);

  // Register / unregister token when the signed-in user changes.
  useEffect(() => {
    if (user && !isGuest) {
      registerForPushNotifications(user.id).catch(() => {});
    } else if (!user) {
      unregisterPushToken().catch(() => {});
    }
  }, [user, isGuest]);

  // Attach notification listeners once on mount (after bridge is ready).
  // addNotificationListeners also calls initNotifications() internally so
  // the handler + channel are set up at the right time.
  useEffect(() => {
    cleanupRef.current = addNotificationListeners(navigationRef);
    return () => {
      cleanupRef.current?.();
    };
  }, [navigationRef]);

  return <PushContext.Provider value={null}>{children}</PushContext.Provider>;
}

export const usePush = () => useContext(PushContext);
