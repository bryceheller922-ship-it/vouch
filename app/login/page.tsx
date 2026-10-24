import type { Metadata } from 'next'
import { LoginForm } from '@/components/auth/LoginForm'
import { Logo } from '@/components/ui/Logo'
import { SetupNotice } from '@/components/ui/SetupNotice'
import { isSupabaseConfigured } from '@/lib/env'
import { safeNext } from '@/lib/safe-next'

export const metadata: Metadata = { title: 'Log in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; ref?: string; error?: string }>
}) {
  if (!isSupabaseConfigured) return <SetupNotice />
  const { next, ref, error } = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      <header className="safe-top py-3">
        <Logo />
      </header>
      <div className="flex flex-1 flex-col justify-center pb-16">
        <LoginForm next={safeNext(next)} refCode={ref ?? null} initialError={error ?? null} />
      </div>
    </main>
  )
}
