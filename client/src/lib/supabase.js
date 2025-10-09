// Lightweight Supabase client initialization
// Requires env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('[supabase] Missing env. Set VITE_SUPABASE_URL (https://<project-ref>.supabase.co) and VITE_SUPABASE_ANON_KEY in client/.env, then restart `npm run dev`.')
}

try {
  // Validate URL shape early so we can emit a readable error instead of letting the Supabase SDK throw a DOMException
  // in production bundles.
  // eslint-disable-next-line no-new
  new URL(supabaseUrl)
} catch (error) {
  throw new Error(`[supabase] Invalid VITE_SUPABASE_URL "${supabaseUrl}". Expected a full https URL, e.g. https://xyzcompany.supabase.co. Original error: ${error instanceof Error ? error.message : String(error)}`)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default supabase
