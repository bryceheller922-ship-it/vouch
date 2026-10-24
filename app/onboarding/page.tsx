import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow'
import { SetupNotice } from '@/components/ui/SetupNotice'
import { isSupabaseConfigured } from '@/lib/env'
import { getMyProfile } from '@/lib/session'

export const metadata: Metadata = { title: 'Join your school' }

export default async function OnboardingPage() {
  if (!isSupabaseConfigured) return <SetupNotice />
  const profile = await getMyProfile()
  if (!profile) redirect('/login?next=/onboarding')
  if (profile.onboarded) redirect('/vote')

  return <OnboardingFlow profile={profile} />
}
