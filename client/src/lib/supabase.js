// Lightweight Supabase client initialization
// Requires env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[supabase] Missing env. Set VITE_SUPABASE_URL (https://<project-ref>.supabase.co) and VITE_SUPABASE_ANON_KEY in client/.env, then restart `npm run dev`.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase
