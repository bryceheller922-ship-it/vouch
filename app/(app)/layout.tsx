import { redirect } from 'next/navigation'
import { BottomNav } from '@/components/ui/BottomNav'
import { SetupNotice } from '@/components/ui/SetupNotice'
import { isSupabaseConfigured } from '@/lib/env'
import { getMyProfile } from '@/lib/session'

/** Authenticated + onboarded shell with the bottom tab bar. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <SetupNotice />
  const profile = await getMyProfile()
  if (!profile) redirect('/login')
  if (!profile.onboarded) redirect('/onboarding')

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-28">
      {children}
      <BottomNav unread={profile.unread_count} />
    </div>
  )
}
