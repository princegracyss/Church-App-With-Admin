import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as defaultColors } from '../theme/theme';
import { supabase } from '../services/supabase';
import { sendPushToAll, sendPushToAllExcept } from '../services/pushNotifications';

// Local cache key — stores the last-known settings so the app renders
// the correct brand colors instantly on next boot without waiting for the
// Supabase round-trip.
const CACHE_KEY = '@parish_settings_v4';

const DEFAULTS = {
  name: 'St. Francis of Assisi Province',
  description: 'Kalamassery',
  logoUri: null,
  primaryColor:      defaultColors.burgundy,  // #6B1E3C
  secondaryColor:    defaultColors.gold,       // #C9A24B
  accentColor:       '#2E7A4F',
  memberOtpEnabled:  false,
};

// ── DB row → app settings ─────────────────────────────────────────────────────
// Supabase uses snake_case; the app uses camelCase.
function rowToSettings(row) {
  if (!row) return null;
  return {
    name:             row.name             ?? DEFAULTS.name,
    description:      row.description      ?? DEFAULTS.description,
    logoUri:          row.logo_uri         ?? DEFAULTS.logoUri,
    primaryColor:     row.primary_color    ?? DEFAULTS.primaryColor,
    secondaryColor:   row.secondary_color  ?? DEFAULTS.secondaryColor,
    accentColor:      row.accent_color     ?? DEFAULTS.accentColor,
    memberOtpEnabled: row.member_otp_enabled ?? DEFAULTS.memberOtpEnabled,
  };
}

// ── App settings → DB row ─────────────────────────────────────────────────────
function settingsToRow(s) {
  return {
    id:                 1,
    name:               s.name,
    description:        s.description,
    logo_uri:           s.logoUri,
    primary_color:      s.primaryColor,
    secondary_color:    s.secondaryColor,
    accent_color:       s.accentColor,
    member_otp_enabled: s.memberOtpEnabled,
    updated_at:         new Date().toISOString(),
  };
}

// ── Colour helpers ────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const clean = (hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function lighten(hex, opacity = 0.15) {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#F4E3EA';
  const r = Math.round(rgb.r * opacity + 255 * (1 - opacity));
  const g = Math.round(rgb.g * opacity + 255 * (1 - opacity));
  const b = Math.round(rgb.b * opacity + 255 * (1 - opacity));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function darkenColor(hex, factor = 0.75) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const r = Math.floor(rgb.r * factor);
  const g = Math.floor(rgb.g * factor);
  const b = Math.floor(rgb.b * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── useTheme ──────────────────────────────────────────────────────────────────
export function useTheme() {
  const { settings } = useParish();
  return useMemo(() => {
    const primary   = settings.primaryColor   || DEFAULTS.primaryColor;
    const secondary = settings.secondaryColor || DEFAULTS.secondaryColor;
    const accent    = settings.accentColor    || DEFAULTS.accentColor;
    return {
      primary,
      primaryLight:   lighten(primary,   0.12),
      primaryDark:    darkenColor(primary, 0.75),
      secondary,
      secondaryLight: lighten(secondary, 0.20),
      accent,
      accentLight:    lighten(accent,    0.12),
    };
  }, [settings.primaryColor, settings.secondaryColor, settings.accentColor]);
}

// ── Context ───────────────────────────────────────────────────────────────────
const ParishContext = createContext(null);

export function ParishProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded]     = useState(false);
  const channelRef              = useRef(null);

  // Apply a settings object and persist it to the local cache.
  const applyAndCache = useCallback((next) => {
    setSettings(next);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ── Boot: load cache immediately, then fetch from Supabase ────────────────
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Restore cached settings immediately so the UI renders with the
      //    correct brand colors before the network round-trip completes.
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw && !cancelled) {
          setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
        }
      } catch (_) {}

      // 2. Fetch the authoritative row from Supabase.
      try {
        const { data, error } = await supabase
          .from('parish_settings')
          .select('*')
          .eq('id', 1)
          .single();

        if (!cancelled && !error && data) {
          const fresh = rowToSettings(data);
          applyAndCache({ ...DEFAULTS, ...fresh });
        }
      } catch (_) {}

      if (!cancelled) setLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [applyAndCache]);

  // ── Realtime: subscribe to parish_settings changes ────────────────────────
  // When an admin saves new settings from any device, Supabase broadcasts
  // the updated row to every subscribed client immediately.
  useEffect(() => {
    channelRef.current = supabase
      .channel('parish-settings-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parish_settings', filter: 'id=eq.1' },
        (payload) => {
          const row = payload.new;
          if (!row) return;
          const fresh = rowToSettings(row);
          applyAndCache({ ...DEFAULTS, ...fresh });
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [applyAndCache]);

  // ── updateSettings: save locally + push to Supabase ──────────────────────
  // The admin's own device applies the change immediately via local state.
  // All other devices receive it via the realtime subscription above.
  // Use a ref for current settings so the callback is always stable and
  // never reads a stale closure.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback(async (patch) => {
    const next = { ...settingsRef.current, ...patch };
    applyAndCache(next);

    // Upsert to Supabase so every other instance gets the realtime broadcast.
    try {
      const { error } = await supabase
        .from('parish_settings')
        .upsert(settingsToRow(next), { onConflict: 'id' });
      if (error) console.warn('[ParishContext] save failed:', error.message);
    } catch (e) {
      console.warn('[ParishContext] save error:', e.message);
    }

    // Push notification — let all devices know the theme/settings changed so
    // they can refresh even if they're not subscribed to Realtime (background).
    // Exclude the admin who made the change — they already see it instantly.
    supabase.auth.getUser().then(({ data: { user } }) => {
      sendPushToAllExcept(
        user?.id ?? null,
        '🎨 Parish settings updated',
        `${next.name} has updated the app theme. Tap to see the new look.`,
        { screen: 'Dashboard', type: 'SETTINGS' },
      ).catch(() => {});
    }).catch(() => {});
  }, [applyAndCache]); // stable — reads settings via ref

  // Don't render children until at least the cache restore has had a chance
  // to run (prevents a single-frame flash of default colors on warm starts).
  if (!loaded) return null;

  return (
    <ParishContext.Provider value={{ settings, updateSettings }}>
      {children}
    </ParishContext.Provider>
  );
}

export const useParish = () => useContext(ParishContext);
