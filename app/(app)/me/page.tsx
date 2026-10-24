import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ProfileView } from '@/components/me/ProfileView'
import { SITE_URL } from '@/lib/env'
import { getMyProfile } from '@/lib/session'

export const metadata: Metadata = { title: 'You' }

export default async function MePage() {
  const profile = await getMyProfile()
  if (!profile) redirect('/login')
  return <ProfileView profile={profile} inviteUrl={`${SITE_URL}/s/${profile.invite_code}`} />
}
