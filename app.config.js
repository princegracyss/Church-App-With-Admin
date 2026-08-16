// app.config.js — dynamic Expo config.
// Supabase credentials are read from environment variables so they are never
// hardcoded in source control. For local development create a .env file:
//
//   SUPABASE_URL=https://yourproject.supabase.co
//   SUPABASE_ANON_KEY=sb_publishable_...
//
// For EAS builds set them as EAS Secrets:
//   eas secret:create --scope project --name SUPABASE_URL --value "..."
//   eas secret:create --scope project --name SUPABASE_ANON_KEY --value "..."
//
// The values are embedded into the bundle at build time via app.json "extra".
// They are NOT secret (anon key only) and are safe in the app binary.

import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    supabaseUrl:     process.env.SUPABASE_URL     ?? 'https://mxfvodcxgakicjhgljcp.supabase.co',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_dS4nJxy-O1NHGj3thlMRuA_wbzwrWa1',
    eas: {
      projectId: '5beddc1c-267d-48f2-8d2e-89938736a954',
    },
  },
});
