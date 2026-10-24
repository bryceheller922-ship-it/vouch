import type { Metadata } from 'next'
import { InboxFeed } from '@/components/inbox/InboxFeed'
import { SITE_URL, isSupabaseConfigured } from '@/lib/env'
import { getMyProfile } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import type { InboxItem, Trophy } from '@/lib/types'

export const metadata: Metadata = { title: 'Inbox' }

export default async function InboxPage() {
  // Layout renders the setup notice; pages render in parallel so guard here too.
  if (!isSupabaseConfigured) return null
  const supabase = await createClient()
  const [profile, inbox, trophies] = await Promise.all([
    getMyProfile(),
    supabase.rpc('get_my_inbox', { p_limit: 100 }),
    supabase.rpc('get_my_trophies'),
  ])
  if (inbox.error) throw new Error(inbox.error.message)

  return (
    <InboxFeed
      items={(inbox.data ?? []) as InboxItem[]}
      trophies={((trophies.data ?? []) as Trophy[]).map((t) => ({ ...t, vote_count: Number(t.vote_count) }))}
      votePoints={profile?.vote_points ?? 0}
      schoolName={profile?.school_name ?? 'your school'}
      inviteUrl={`${SITE_URL}/s/${profile?.invite_code ?? ''}`}
      siteUrl={SITE_URL}
    />
  )
}
