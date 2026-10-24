import type { Metadata } from 'next'
import { VoteLoop } from '@/components/vote/VoteLoop'
import { SITE_URL, isSupabaseConfigured } from '@/lib/env'
import { getMyProfile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { Round } from '@/lib/types'

export const metadata: Metadata = { title: 'Vote' }

export default async function VotePage() {
  // Layout renders the setup notice; pages render in parallel so guard here too.
  if (!isSupabaseConfigured) return null
  const supabase = await createClient()
  const [profile, { data, error }] = await Promise.all([getMyProfile(), supabase.rpc('get_next_round')])
  if (error) throw new Error(error.message)

  return (
    <VoteLoop
      initialRound={data as Round}
      schoolName={profile?.school_name ?? 'your school'}
      inviteUrl={`${SITE_URL}/s/${profile?.invite_code ?? ''}`}
    />
  )
}
