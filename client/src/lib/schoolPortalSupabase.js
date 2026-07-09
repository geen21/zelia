// Dedicated Supabase client for the school/établissement portal ("Espace écoles").
// Uses its own storageKey so a school session is fully isolated from the
// student session (client/src/lib/supabase.js): logging in on one interface
// never touches or gets overridden by the other, even in the same browser.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[schoolPortalSupabase] Missing env. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const schoolPortalSupabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'sb-espace-ecoles-auth-token',
    persistSession: true,
    autoRefreshToken: true
  }
})

export default schoolPortalSupabase
