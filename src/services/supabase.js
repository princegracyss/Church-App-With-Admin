import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Credentials are injected at build time via app.config.js "extra" so they
// never have to be hardcoded in source — see app.config.js for details.
// Falls back to the hardcoded values so existing setups keep working without
// any .env changes.
const SUPABASE_URL =
  Constants.expoConfig?.extra?.supabaseUrl ??
  'https://mxfvodcxgakicjhgljcp.supabase.co';
const SUPABASE_ANON_KEY =
  Constants.expoConfig?.extra?.supabaseAnonKey ??
  'sb_publishable_dS4nJxy-O1NHGj3thlMRuA_wbzwrWa1';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
