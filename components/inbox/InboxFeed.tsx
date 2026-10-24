'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Lock, Send, Sparkles } from 'lucide-react'
import { RevealModal } from '@/components/inbox/RevealModal'
import { Toast } from '@/components/ui/Toast'
import { CATEGORY_GRADIENT, GRADE_LABEL, hintSubject, timeAgo } from '@/lib/format'
import { createClient } from '@/lib/supabase/client'
import type { Grade, InboxItem, Trophy, UnlockResult } from '@/lib/types'

interface Props {
  items: InboxItem[]
  trophies: Trophy[]
  votePoints: number
  schoolName: string
  inviteUrl: string
  siteUrl: string
}

export function InboxFeed({ items: initialItems, trophies, votePoints, schoolName, inviteUrl, siteUrl }: Props) {
  const [items, setItems] = useState(initialItems)
  const [active, setActive] = useState<InboxItem | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  // Mark everything as seen once the inbox has been opened.
  useEffect(() => {
    if (initialItems.some((i) => i.is_new)) void createClient().rpc('mark_inbox_seen')
  }, [initialItems])

  function onUnlocked(result: UnlockResult) {
    setItems((prev) =>
      prev.map((i) => (i.vote_id === result.vote_id ? { ...i, hints: result.hints, next_reveal: result.next_reveal } : i)),
    )
    setActive((prev) => (prev && prev.vote_id === result.vote_id ? { ...prev, hints: result.hints, next_reveal: result.next_reveal } : prev))
  }

  async function invite() {
    try {
      if (navigator.share) await navigator.share({ title: 'vouch', text: 'vote for me on vouch 👀', url: inviteUrl })
      else {
        await navigator.clipboard.writeText(inviteUrl)
        setToast('Invite link copied 📋')
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="safe-top pt-2">
      <Toast message={toast} onClose={() => setToast(null)} />

      <header className="flex items-end justify-between py-3">
        <div>
          <h1 className="text-[34px] leading-none font-black tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-mute">
            {items.length > 0 ? `${items.length} ${items.length === 1 ? 'person has' : 'people have'} vouched for you` : schoolName}
          </p>
        </div>
        <div className="rounded-2xl border border-volt/30 bg-volt/10 px-3 py-2 text-right">
          <div className="text-[10px] font-black tracking-widest text-volt uppercase">Aura</div>
          <div className="text-lg leading-none font-black tabular-nums">{votePoints.toLocaleString()}</div>
        </div>
      </header>

      {/* Trophies */}
      {trophies.length > 0 && (
        <section aria-label="Trophies" className="-mx-5 mb-4">
          <div className="flex snap-x gap-2.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
            {trophies.map((t, i) => (
              <div
                key={t.question_text}
                className={`relative w-40 shrink-0 snap-start overflow-hidden rounded-3xl bg-gradient-to-br p-[1.5px] ${CATEGORY_GRADIENT[t.category]}`}
              >
                <div className="flex h-full flex-col rounded-[22px] bg-card p-3.5">
                  <div className="flex items-start justify-between">
                    <span className="text-3xl">{t.emoji}</span>
                    {i === 0 && <span className="rounded-full bg-volt px-2 py-0.5 text-[10px] font-black text-ink">TOP</span>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] leading-tight font-bold">{t.question_text}</p>
                  <p className="mt-auto pt-2 text-xs font-black text-volt">×{t.vote_count}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Feed */}
      {items.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-3 p-8 text-center">
          <div className="text-5xl">💌</div>
          <h2 className="text-xl font-black">No votes… yet</h2>
          <p className="max-w-xs text-sm text-mute">
            The more you vote, the more you show up on other people’s screens. Invite friends to speed it up.
          </p>
          <div className="mt-2 w-full space-y-2">
            <Link href="/vote" className="btn-primary">
              <Sparkles size={18} /> Start voting
            </Link>
            <button onClick={invite} className="btn-ghost">
              <Send size={18} /> Invite friends
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, i) => {
            const unlockedCount = Object.keys(item.hints).length
            return (
              <li
                key={item.vote_id}
                className="animate-rise"
                style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
              >
                <div className={`card flex items-center gap-3 p-3.5 ${item.is_new ? 'border-volt/40' : ''}`}>
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-2xl ${CATEGORY_GRADIENT[item.category]}`}
                  >
                    {item.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] leading-snug">
                      <span className="font-black">{hintSubject(item.hints)}</span> voted you
                    </p>
                    <p className="truncate text-[15px] font-bold text-white/90">“{item.question_text}”</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-mute">
                      {item.is_new && <span className="h-1.5 w-1.5 rounded-full bg-hot" aria-label="new" />}
                      <span>{timeAgo(item.received_at, now)}</span>
                      {unlockedCount > 0 && (
                        <span className="text-volt">
                          · {unlockedCount}/3 hints
                          {item.hints.grade && item.hints.grade in GRADE_LABEL ? ` · ${GRADE_LABEL[item.hints.grade as Grade]}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  {item.next_reveal ? (
                    <button
                      onClick={() => setActive(item)}
                      className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl bg-volt px-3 py-2 text-ink transition active:scale-95"
                      aria-label="Reveal a hint about who voted"
                    >
                      <Lock size={18} strokeWidth={2.8} />
                      <span className="text-[10px] leading-none font-black">REVEAL</span>
                    </button>
                  ) : (
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-line text-volt" title="All hints unlocked">
                      <Check size={18} strokeWidth={3} />
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {items.length > 0 && (
        <p className="mt-6 text-center text-xs text-mute">
          <Lock size={11} className="inline" /> Tap <span className="font-bold text-volt">REVEAL</span> to unlock a hint
          about who voted. Votes stay anonymous: hints only.
        </p>
      )}

      {active && (
        <RevealModal
          item={active}
          siteUrl={siteUrl}
          onClose={() => setActive(null)}
          onUnlocked={onUnlocked}
        />
      )}
    </div>
  )
}
