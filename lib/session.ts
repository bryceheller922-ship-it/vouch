import { cache } from 'react'
import { isSupabaseConfigured } from '@/lib/env'
import { createClient } from '@/lib/supabase/server'
import type { MyProfile } from '@/lib/types'

/**
 * The signed-in user's profile, or null. One PostgREST round trip: the JWT is
 * verified by the database, and `get_my_profile()` returns null when there is
 * no user. Memoized per request with React.cache().
 */
export const getMyProfile = cache(async (): Promise<MyProfile | null> => {
  if (!isSupabaseConfigured) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_my_profile')
  if (error || !data) return null
  return data as MyProfile
})
