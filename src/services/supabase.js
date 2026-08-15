import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// From Supabase dashboard → Project Settings → API. The anon key is safe to
// ship in the app — it only grants what your Row Level Security policies
// (supabase/schema.sql) allow for the signed-in user's role.
const SUPABASE_URL = 'https://mxfvodcxgakicjhgljcp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dS4nJxy-O1NHGj3thlMRuA_wbzwrWa1';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export default supabase;
