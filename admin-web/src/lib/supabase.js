import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mxfvodcxgakicjhgljcp.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_dS4nJxy-O1NHGj3thlMRuA_wbzwrWa1'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
