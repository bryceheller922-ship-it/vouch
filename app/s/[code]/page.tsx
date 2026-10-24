import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { after } from 'next/server'
import { cache } from 'react'
import { ArrowRight, Lock } from 'lucide-react'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { Logo } from '@/components/ui/Logo'
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env'
import { getMyProfile } from '@/lib/session'
import type { SharePreview } from '@/lib/types'

type Params = Promise<{ code: string }>

function anon() {
  return createAnonClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

const getPreview = cache(async (code: string): Promise<SharePreview | null> => {
  if (!isSupabaseConfigured || !/^[a-z0-9]{4,18}$/.test(code)) return null
  const { data } = await anon().rpc('get_share_preview', { p_code: code })
  return (data as SharePreview | null) ?? null
})

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { code } = await params
  const p = await getPreview(code)
  if (!p) return { title: 'vouch' }

  const title =
    p.kind === 'vote' && p.question_text
      ? `${p.display_name ?? 'Someone'} got voted “${p.question_text}”`
      : `${p.display_name ?? 'A friend'} invited you to vouch`
  const description = `Anonymous compliments from people at ${p.school_name ?? 'your school'}. Find out who’s voting for you 👀`
  const image = `/api/og/poll?code=${p.code}&format=og`

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
    robots: { index: false },
  }
}

export default async function SharePage({ params }: { params: Params }) {
  const { code } = await params
  const [preview, viewer] = await Promise.all([getPreview(code), getMyProfile()])
  if (!preview) notFound()

  // Count the visit after the response is sent (doesn't slow down the page).
  after(async () => {
    await anon().rpc('track_share_click', { p_code: code })
  })

  const isVote = preview.kind === 'vote' && preview.question_text
  const school = preview.school_name ?? 'your school'
  const cta = viewer?.onboarded ? { href: '/vote', label: 'Go vote' } : { href: `/login?ref=${preview.code}`, label: 'See who’s voting for you' }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      <header className="safe-top flex items-center justify-between py-3">
        <Logo />
        <span className="chip">{school}</span>
      </header>

      <div className="flex flex-1 flex-col justify-center py-8">
        <p className="animate-rise text-center text-sm font-bold text-mute">
          {isVote ? (
            <>
              someone at {school} voted{' '}
              <span className="text-white">{preview.display_name ?? `@${preview.instagram_handle}`}</span>
            </>
          ) : (
            <>
              <span className="text-white">{preview.display_name ?? `@${preview.instagram_handle}`}</span> wants you on vouch
            </>
          )}
        </p>

        {isVote ? (
          <div className="animate-pop mx-auto mt-5 w-full rotate-[-2deg] rounded-[32px] bg-volt p-7 text-ink shadow-[0_30px_90px_-20px_rgba(212,255,58,0.55)]">
            <div className="text-6xl">{preview.emoji}</div>
            <p className="mt-4 text-[34px] leading-[1.02] font-black tracking-tight">“{preview.question_text}”</p>
            {preview.vote_count > 1 && <p className="mt-4 text-sm font-black opacity-70">🔥 {preview.vote_count} votes and counting</p>}
          </div>
        ) : (
          <div className="animate-pop mt-5 text-center">
            <div className="text-7xl">👀</div>
            <h1 className="mt-4 text-[40px] leading-[0.98] font-black tracking-tight">
              Find out who’s <span className="glow-text">hyping you.</span>
            </h1>
          </div>
        )}

        <div className="card mt-10 flex items-center gap-3 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-hot text-white">
            <Lock size={20} strokeWidth={2.6} />
          </span>
          <p className="text-sm">
            <span className="font-black">People at {school} might be voting for you right now.</span>{' '}
            <span className="text-mute">Join to see your compliments.</span>
          </p>
        </div>

        <Link href={cta.href} className="btn-primary mt-6">
          {cta.label} <ArrowRight size={20} strokeWidth={3} />
        </Link>
        <p className="mt-3 text-center text-xs font-semibold text-mute">Free · anonymous · compliments only</p>
      </div>
    </main>
  )
}
