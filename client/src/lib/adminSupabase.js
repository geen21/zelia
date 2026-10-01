import { createClient } from '@supabase/supabase-js'

export const adminSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL.trim(),
  import.meta.env.VITE_SUPABASE_ANON_KEY.trim(),
  { auth: { storageKey: 'sb-zelia-admin-auth-token', storage: window.sessionStorage, persistSession: true, autoRefreshToken: true } }
)