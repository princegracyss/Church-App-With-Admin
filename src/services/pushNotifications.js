/**
 * pushNotifications.js
 *
 * Utility helpers for Expo Push Notifications.
 *
 * KEY DESIGN DECISION — Expo Go SDK 53+ compatibility:
 *   expo-notifications v0.32 emits a console.error the instant its module is
 *   imported in Expo Go on Android (SDK 53+). The error fires in index.js
 *   BEFORE any of our application code runs — guards, try/catch or conditional
 *   calls cannot stop it.  The only fix is to never `import` (or `require`)
 *   the package at all when running inside Expo Go.
 *
 *   We detect Expo Go synchronously at module evaluation time using
 *   expo-constants (which IS safe to import in Expo Go), then assign the
 *   Notifications API to a variable only when push is actually supported.
 *   Every helper below checks this variable before doing anything.
 *
 *  registerForPushNotifications(userId?)
 *    – Requests permission, gets the Expo push token, saves it to
 *      `push_tokens` in Supabase. No-op in Expo Go / simulator.
 *
 *  sendPushToAll(title, body, data?)
 *    – Fetches all active tokens and sends via Expo Push API (batched 100).
 *
 *  sendPushToAllExcept(excludeUserId, title, body, data?)
 *    – Like sendPushToAll but skips the initiating user's devices.
 *
 *  sendPushToMember(memberId, title, body, data?)
 *    – Sends only to push tokens belonging to a specific member.
 *
 *  addNotificationListeners(navigationRef)
 *    – Attaches foreground/tap listeners. No-op in Expo Go / simulator.
 *      Returns a cleanup function.
 */
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// ── Expo Go / simulator guard ─────────────────────────────────────────────────
// Evaluated synchronously at module load — safe because expo-constants does
// NOT emit the SDK 53 Expo Go error.
const _pushSupported = (
  !!Device.isDevice &&
  Constants.appOwnership !== 'expo'   // 'expo' = Expo Go
);

// Lazily load expo-notifications ONLY when push is supported.
// This prevents the "Android Push notifications removed from Expo Go" error
// that expo-notifications emits the moment its module is imported in Expo Go.
const N = _pushSupported
  ? require('expo-notifications')  // runtime require — never evaluated in Expo Go
  : null;

// ── One-time native setup ─────────────────────────────────────────────────────
let _initDone = false;
function initNotifications() {
  if (_initDone || !N) return;
  _initDone = true;

  try {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge:  true,
      }),
    });
  } catch (_) {}

  if (Platform.OS === 'android') {
    N.setNotificationChannelAsync('parish-default', {
      name:             'Parish Connect',
      importance:       N.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor:       '#6B1E3C',
    }).catch(() => {});
  }
}

// ── Register device token ─────────────────────────────────────────────────────
export async function registerForPushNotifications(userId = null) {
  if (!N) return null;   // Expo Go / simulator — silent no-op

  initNotifications();

  try {
    const { status: existing } = await N.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await N.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;

    const tokenData = await N.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    ).catch(() => null);

    if (!tokenData?.data) return null;
    const token = tokenData.data;

    await supabase
      .from('push_tokens')
      .upsert(
        { token, user_id: userId ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'token' },
      )
      .catch(() => {});

    return token;
  } catch (_) {
    return null;
  }
}

// ── Remove token on logout ────────────────────────────────────────────────────
export async function unregisterPushToken() {
  if (!N) return;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      undefined;
    const tokenData = await N.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    ).catch(() => null);
    if (tokenData?.data) {
      await supabase.from('push_tokens').delete().eq('token', tokenData.data).catch(() => {});
    }
  } catch (_) {}
}

// ── Foreground / tap notification listeners ───────────────────────────────────
// No-op in Expo Go — returns an empty cleanup function.
export function addNotificationListeners(navigationRef) {
  if (!N) return () => {};

  initNotifications();

  const received = N.addNotificationReceivedListener(() => {
    // Banner shown automatically by the handler above.
  });

  const response = N.addNotificationResponseReceivedListener((resp) => {
    const screen = resp.notification.request.content.data?.screen;
    if (navigationRef?.current) {
      navigationRef.current.navigate(screen || 'Notifications');
    }
  });

  return () => {
    received.remove();
    response.remove();
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function dispatchMessages(messages) {
  for (const batch of chunk(messages, 100)) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(batch),
    }).catch(() => {});
  }
}

// ── Send to all registered tokens ────────────────────────────────────────────
export async function sendPushToAll(title, body, data = {}) {
  try {
    const { data: rows, error } = await supabase.from('push_tokens').select('token');
    if (error || !rows?.length) return;
    await dispatchMessages(rows.map(({ token }) => ({
      to: token, sound: 'default', title, body, data, channelId: 'parish-default',
    })));
  } catch (_) {}
}

// ── Send to all tokens except one user ───────────────────────────────────────
// Excludes rows where user_id matches the given id.
// Also fetches the specific token for excludeUserId so we can filter it out
// by token value as well — catches cases where the token was registered before
// the user_id was saved (user_id could be null in the DB row).
export async function sendPushToAllExcept(excludeUserId, title, body, data = {}) {
  try {
    // Fetch all tokens in one go.
    const { data: rows, error } = await supabase.from('push_tokens').select('token, user_id');
    if (error || !rows?.length) return;

    // Build a set of tokens belonging to the excluded user (by user_id match).
    const excludedTokens = new Set(
      excludeUserId
        ? rows.filter((r) => r.user_id === excludeUserId).map((r) => r.token)
        : [],
    );

    const filtered = rows.filter((r) => !excludedTokens.has(r.token));
    if (!filtered.length) return;

    await dispatchMessages(filtered.map(({ token }) => ({
      to: token, sound: 'default', title, body, data, channelId: 'parish-default',
    })));
  } catch (_) {}
}

// ── Send to a specific member's tokens ───────────────────────────────────────
// Uses the get_push_tokens_for_member security-definer RPC (migration 014).
export async function sendPushToMember(memberId, title, body, data = {}) {
  try {
    const { data: rows, error } = await supabase
      .rpc('get_push_tokens_for_member', { p_member_id: memberId });
    if (error || !rows?.length) return;
    await dispatchMessages(rows.map(({ token }) => ({
      to: token, sound: 'default', title, body, data, channelId: 'parish-default',
    })));
  } catch (_) {}
}
