'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Inbox, Loader2, Send, Shuffle, SkipForward } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Countdown } from '@/components/ui/Countdown'
import { Toast } from '@/components/ui/Toast'
import { friendlyError } from '@/lib/errors'
import { avatarSrc, CATEGORY_GRADIENT, GRADE_LABEL } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import type { Nominee, Round } from '@/lib/types'

/** Minimum time the "voted ✓" state stays on screen so the tap feels rewarding. */
const CELEBRATE_MS = 420

type Action = { action: 'vote'; poll_id: string; nominee_id: string } | { action: 'skip'; poll_id: string } | { action: 'next' }

async function postRound(body: Action): Promise<Round> {
  const res = await fetch('/api/vote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as { round?: Round; error?: string }
  if (res.status === 401) throw new Error('not_authenticated')
  if (!res.ok || !payload.round) throw new Error(payload.error ?? 'request_failed')
  return payload.round
}

/** Warm the browser cache so the next grid paints with photos immediately. */
function preloadAvatars(nominees: Nominee[]) {
  nominees.forEach((n) => {
    const src = avatarSrc(n.avatar_url)
    if (src) {
      const img = new Image()
      img.src = src
    }
  })
}

export function VoteLoop({ initialRound, schoolName, inviteUrl }: { initialRound: Round; schoolName: string; inviteUrl: string }) {
  const router = useRouter()
  const [round, setRound] = useState<Round>(initialRound)
  const [selected, setSelected] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'vote' | 'skip' | 'shuffle'>(null)
  const [toast, setToast] = useState<{ msg: string; tone: 'default' | 'error' } | null>(null)
  const [streak, setStreak] = useState(0)
  const busyRef = useRef(false)

  const run = useCallback(async (body: Action, kind: 'vote' | 'skip' | 'shuffle', minDelay = 0) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(kind)
    try {
      const [next] = await Promise.all([postRound(body), new Promise((r) => setTimeout(r, minDelay))])
      preloadAvatars(next.nominees)
      setRound(next)
      if (kind === 'vote') setStreak((s) => s + 1)
    } catch (e) {
      const message = e instanceof Error ? e.message : ''
      if (message === 'not_authenticated') {
        router.replace('/login?next=/vote')
        return
      }
      setToast({ msg: friendlyError(message), tone: 'error' })
      haptic([10, 40, 10])
      // Self-heal: closed/missing poll → just fetch a fresh round.
      if (/poll_closed|poll_not_found|nominee_not_found/.test(message)) {
        try {
          setRound(await postRound({ action: 'next' }))
        } catch {
          /* keep current */
        }
      }
    } finally {
      setSelected(null)
      setBusy(null)
      busyRef.current = false
    }
  }, [router])

  function vote(nominee: Nominee) {
    if (!round.poll || busyRef.current) return
    setSelected(nominee.id)
    haptic(14)
    void run({ action: 'vote', poll_id: round.poll.id, nominee_id: nominee.id }, 'vote', CELEBRATE_MS)
  }

  function skip() {
    if (!round.poll) return
    haptic(8)
    void run({ action: 'skip', poll_id: round.poll.id }, 'skip')
  }

  function shuffle() {
    haptic(8)
    void run({ action: 'next' }, 'shuffle')
  }

  async function invite() {
    const text = `vote for me on vouch 👀`
    try {
      if (navigator.share) {
        await navigator.share({ title: 'vouch', text, url: inviteUrl })
      } else {
        await navigator.clipboard.writeText(`${text} ${inviteUrl}`)
        setToast({ msg: 'Invite link copied 📋', tone: 'default' })
      }
    } catch {
      /* user cancelled */
    }
  }

  // Keyboard shortcuts on desktop: 1–4 vote, S skip, R shuffle.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!round.poll || busyRef.current || e.metaKey || e.ctrlKey) return
      const idx = ['1', '2', '3', '4'].indexOf(e.key)
      if (idx >= 0 && round.nominees[idx]) vote(round.nominees[idx])
      if (e.key.toLowerCase() === 's') skip()
      if (e.key.toLowerCase() === 'r') shuffle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const { poll, nominees, progress } = round
  const segments = Math.max(progress.total, 1)

  return (
    <div className="safe-top flex flex-1 flex-col pt-2">
      <Toast message={toast?.msg ?? null} tone={toast?.tone} onClose={() => setToast(null)} />

      {/* Progress */}
      <div className="flex items-center gap-3 py-2">
        <div className="flex flex-1 gap-1" aria-label={`${progress.answered} of ${progress.total} answered`}>
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${i < progress.answered ? 'bg-volt' : 'bg-card'}`}
            />
          ))}
        </div>
        <span className="text-xs font-black text-mute tabular-nums">
          {Math.min(progress.answered + (poll ? 1 : 0), progress.total)}/{progress.total}
        </span>
      </div>

      {poll ? (
        <div key={poll.id + nominees.map((n) => n.id).join('')} className="flex flex-1 flex-col">
          {/* Question */}
          <section className="animate-pop relative mt-3 overflow-hidden rounded-[28px] border border-line bg-card px-6 pt-7 pb-8 text-center">
            <div className={`pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-gradient-to-r opacity-25 blur-3xl ${CATEGORY_GRADIENT[poll.category]}`} />
            <div className="relative">
              <div className="text-[64px] leading-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)]">{poll.emoji}</div>
              <h1 className="mt-4 text-[27px] leading-[1.08] font-black tracking-tight text-balance">{poll.question_text}</h1>
              <p className="mt-2 text-xs font-bold tracking-[0.18em] text-mute uppercase">{schoolName}</p>
            </div>
          </section>

          {/* Nominees */}
          {nominees.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {nominees.map((n, i) => {
                const isSelected = selected === n.id
                const dimmed = selected !== null && !isSelected
                return (
                  <button
                    key={n.id}
                    onClick={() => vote(n)}
                    disabled={busy !== null}
                    style={{ animationDelay: `${60 + i * 45}ms` }}
                    className={`animate-rise relative flex flex-col items-center gap-2.5 rounded-3xl border px-3 pt-5 pb-4 text-center transition duration-200 active:scale-[0.96] ${
                      isSelected
                        ? 'scale-[1.03] border-volt bg-volt text-ink shadow-[0_0_40px_-6px_rgba(212,255,58,0.7)]'
                        : 'border-line bg-card hover:border-white/20 hover:bg-raised'
                    } ${dimmed ? 'scale-95 opacity-30' : ''}`}
                    aria-label={`Vote for ${n.display_name}`}
                  >
                    {isSelected && (
                      <span className="animate-pop absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full bg-ink text-volt">
                        <Check size={16} strokeWidth={3.5} />
                      </span>
                    )}
                    <Avatar id={n.id} name={n.display_name} path={n.avatar_url} size={68} />
                    <div className="w-full min-w-0">
                      <div className="truncate text-[17px] leading-tight font-black">{n.display_name}</div>
                      <div className={`truncate text-xs font-semibold ${isSelected ? 'text-ink/70' : 'text-mute'}`}>
                        {GRADE_LABEL[n.grade]} · @{n.instagram_handle}
                      </div>
                    </div>
                  </button>
                )
              })}
              {nominees.length < 4 &&
                Array.from({ length: 4 - nominees.length }).map((_, i) => (
                  <button
                    key={`invite-${i}`}
                    onClick={invite}
                    className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-line p-4 text-center text-xs font-bold text-mute hover:text-white"
                  >
                    <Send size={22} />
                    Invite a friend
                  </button>
                ))}
            </div>
          ) : (
            <EmptySchool schoolName={schoolName} onInvite={invite} />
          )}

          {/* Controls */}
          <div className="mt-4 flex gap-3">
            <button onClick={shuffle} disabled={busy !== null || round.classmates <= 4} className="btn-ghost h-12 flex-1 text-sm">
              {busy === 'shuffle' ? <Loader2 size={18} className="animate-spin" /> : <Shuffle size={18} />} Shuffle
            </button>
            <button onClick={skip} disabled={busy !== null} className="btn-ghost h-12 flex-1 text-sm">
              {busy === 'skip' ? <Loader2 size={18} className="animate-spin" /> : <SkipForward size={18} />} Skip
            </button>
          </div>

          {streak >= 3 && (
            <p key={streak} className="animate-fade mt-4 text-center text-xs font-bold text-mute">
              🔥 {streak} votes this session. You just made {streak} people’s day.
            </p>
          )}
        </div>
      ) : (
        <DoneForToday
          nextDropAt={round.next_drop_at}
          answered={progress.answered}
          onRefresh={() => run({ action: 'next' }, 'shuffle')}
          onInvite={invite}
        />
      )}
    </div>
  )
}

function EmptySchool({ schoolName, onInvite }: { schoolName: string; onInvite: () => void }) {
  return (
    <div className="card mt-4 flex flex-col items-center gap-3 p-6 text-center">
      <div className="text-4xl">🫥</div>
      <h2 className="text-xl font-black">You’re early!</h2>
      <p className="text-sm text-mute">
        Nobody else from {schoolName} is here yet. Invite friends so you have people to vote for (and get votes back).
      </p>
      <button onClick={onInvite} className="btn-primary mt-2">
        <Send size={18} strokeWidth={2.6} /> Invite friends
      </button>
    </div>
  )
}

function DoneForToday({
  nextDropAt,
  answered,
  onRefresh,
  onInvite,
}: {
  nextDropAt: string
  answered: number
  onRefresh: () => void
  onInvite: () => void
}) {
  return (
    <div className="animate-rise flex flex-1 flex-col items-center justify-center py-8 text-center">
      <div className="relative mb-6">
        <span className="animate-burst absolute inset-0 rounded-full bg-volt/40" />
        <div className="flex h-28 w-28 items-center justify-center rounded-full bg-volt text-6xl">🏁</div>
      </div>
      <h1 className="text-[34px] leading-tight font-black tracking-tight">That’s a wrap!</h1>
      <p className="mt-2 max-w-xs text-mute">
        You answered {answered} {answered === 1 ? 'poll' : 'polls'} today. New polls drop in
      </p>
      <div className="mt-3 rounded-2xl border border-line bg-card px-6 py-3 font-mono text-3xl font-black text-volt">
        <Countdown target={nextDropAt} onDone={onRefresh} />
      </div>
      <div className="mt-10 w-full space-y-3">
        <button onClick={onInvite} className="btn-primary">
          <Send size={18} strokeWidth={2.6} /> Invite friends for more votes
        </button>
        <Link href="/inbox" className="btn-ghost">
          <Inbox size={18} /> Check your inbox
        </Link>
      </div>
    </div>
  )
}
