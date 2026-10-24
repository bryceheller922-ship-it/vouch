'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/env'

let browserClient: SupabaseClient | undefined

/** Singleton Supabase client for Client Components. */
export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_KEY)
  }
  return browserClient
}
