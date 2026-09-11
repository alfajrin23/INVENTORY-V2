import { createClient } from '@supabase/supabase-js'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const supabasePublishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

export const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true'
export const supabaseReady = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = supabaseReady
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
