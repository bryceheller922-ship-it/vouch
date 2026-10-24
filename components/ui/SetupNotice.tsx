import { Logo } from '@/components/ui/Logo'

/** Shown instead of crashing when Supabase env vars are missing. */
export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <Logo />
      <div className="card space-y-3 p-6">
        <h1 className="text-2xl font-black">Connect Supabase to continue</h1>
        <p className="text-sm text-mute">
          Add these to <code className="text-white">.env.local</code> (or your Vercel project) and restart:
        </p>
        <pre className="overflow-x-auto rounded-2xl bg-ink p-4 text-xs text-volt">
          {`NEXT_PUBLIC_SUPABASE_URL=...\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...\nNEXT_PUBLIC_SITE_URL=https://vouch.school`}
        </pre>
        <p className="text-sm text-mute">Then run the SQL migration in <code className="text-white">supabase/migrations</code>. See README.</p>
      </div>
    </main>
  )
}
