'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Download, Loader2, Lock, Unlock, X } from 'lucide-react'
import { InstagramIcon } from '@/components/ui/InstagramIcon'
import { errorCode, friendlyError } from '@/lib/errors'
import { GENDER_LABEL, GRADE_LABEL, hintSentence, hintValueLabel, REVEAL_LABEL } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { createClient } from '@/lib/supabase/client'
import { REVEAL_ORDER, type Gender, type Grade, type InboxItem, type RevealType, type UnlockResult } from '@/lib/types'

type Phase = 'preparing' | 'ready' | 'unlocking' | 'revealed' | 'error'

interface Props {
  item: InboxItem
  siteUrl: string
  onClose: () => void
  onUnlocked: (result: UnlockResult) => void
}

/**
 * The viral loop.
 *  1. Create a fresh short link for this vote  → /s/<code>
 *  2. Pre-render the story image (/api/og/poll?code=…) into a File, so the
 *     share sheet can open synchronously inside the tap gesture (iOS requires it)
 *  3. "Share to Instagram Story" → Web Share API with the PNG; the link is
 *     copied to the clipboard for Instagram's link sticker
 *  4. Share resolves → unlock_reveal(code) RPC → show the hint
 */
export function RevealModal({ item, siteUrl, onClose, onUnlocked }: Props) {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>('preparing')
  const [attempt, setAttempt] = useState(0)
  const [code, setCode] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fallback, setFallback] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [result, setResult] = useState<UnlockResult | null>(null)
  const [hints, setHints] = useState(item.hints)
  const sheetRef = useRef<HTMLDivElement>(null)

  const shareUrl = code ? `${siteUrl}/s/${code}` : ''
  const nextType: RevealType | null = result ? result.next_reveal : item.next_reveal

  // 1 + 2: create link and pre-render the story image.
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function prepare() {
      setPhase('preparing')
      setNotice(null)
      setFallback(false)
      const { data, error } = await supabase.rpc('create_share_link', { p_vote_id: item.vote_id })
      if (cancelled) return
      if (error || typeof data !== 'string') {
        setNotice(friendlyError(error))
        setPhase('error')
        return
      }
      try {
        const res = await fetch(`/api/og/poll?code=${encodeURIComponent(data)}`)
        if (!res.ok) throw new Error('image')
        const blob = await res.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setCode(data)
        setFile(new File([blob], `vouch-${data}.png`, { type: 'image/png' }))
        setPreviewUrl(objectUrl)
        setPhase('ready')
      } catch {
        if (cancelled) return
        setNotice('Couldn’t render your story card. Check your connection.')
        setPhase('error')
      }
    }
    void prepare()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [attempt, item.vote_id, supabase])

  // Escape to close + lock background scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    sheetRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const unlock = useCallback(async () => {
    if (!code) return
    setPhase('unlocking')
    const { data, error } = await supabase.rpc('unlock_reveal', { p_code: code })
    if (error) {
      const c = errorCode(error)
      if (c === 'share_link_already_used') {
        setAttempt((a) => a + 1)
        return
      }
      setNotice(friendlyError(error))
      setPhase(c === 'all_hints_unlocked' ? 'revealed' : 'ready')
      return
    }
    const r = data as UnlockResult
    setResult(r)
    setHints(r.hints)
    onUnlocked(r)
    setPhase('revealed')
    haptic([10, 50, 10, 50, 30])
  }, [code, onUnlocked, supabase])

  async function copyLink() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setNotice('Link copied. Paste it into a link sticker 🔗')
    } catch {
      setNotice(shareUrl)
    }
  }

  // 3: share. Must stay synchronous up to navigator.share() to keep the gesture.
  async function shareToStory() {
    if (!file || !code) return
    haptic(12)
    navigator.clipboard?.writeText(shareUrl).catch(() => {})
    const data: ShareData = { files: [file] }
    if (typeof navigator.canShare === 'function' && navigator.canShare(data)) {
      try {
        await navigator.share(data)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setNotice('Share cancelled. Post your card to unlock the hint.')
          return
        }
        setFallback(true)
        return
      }
      await unlock()
    } else {
      setFallback(true)
    }
  }

  function shareAgain() {
    setResult(null)
    setCode(null)
    setFile(null)
    setPreviewUrl(null)
    setAttempt((a) => a + 1)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Reveal a hint">
      <button className="animate-fade absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="animate-sheet safe-bottom relative max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-t-[32px] border-t border-line bg-ink px-5 pt-3 outline-none"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        <button onClick={onClose} className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-card text-mute hover:text-white" aria-label="Close">
          <X size={18} />
        </button>

        {/* Context */}
        <div className="flex items-center gap-3 pr-10">
          <span className="text-3xl">{item.emoji}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-mute">Someone voted you</p>
            <p className="truncate font-black">“{item.question_text}”</p>
          </div>
        </div>

        <HintTrack hints={hints} highlight={result?.reveal_type ?? null} />

        {phase === 'revealed' ? (
          <div className="pb-4 text-center">
            {result ? (
              <div className="animate-pop relative mx-auto mt-2 overflow-hidden rounded-[28px] bg-volt p-6 text-ink">
                <span className="animate-burst absolute top-1/2 left-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/60" />
                <div className="relative">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-volt">
                    <Unlock size={22} strokeWidth={2.6} />
                  </div>
                  <p className="text-xs font-black tracking-[0.2em] uppercase opacity-70">{REVEAL_LABEL[result.reveal_type]} unlocked</p>
                  <p className="mt-1 text-[28px] leading-tight font-black tracking-tight">
                    {hintValueLabel(result.reveal_type, result.hint_value)}
                  </p>
                </div>
              </div>
            ) : null}
            <p className="mt-5 text-lg font-bold">{hintSentence(hints)}.</p>
            {notice && <p className="mt-2 text-sm text-mute">{notice}</p>}
            <div className="mt-6 space-y-2">
              {nextType ? (
                <button onClick={shareAgain} className="btn-insta">
                  <InstagramIcon size={20} /> Share again to unlock {REVEAL_LABEL[nextType].toLowerCase()}
                </button>
              ) : (
                <p className="rounded-2xl border border-line bg-card p-4 text-sm font-bold">🕵️ You’ve unlocked every hint for this vote.</p>
              )}
              <button onClick={onClose} className="btn-ghost">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="pb-4">
            <div className="mt-1 flex items-center justify-center">
              <div className="relative aspect-[9/16] w-[46%] rotate-[-2deg] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_30px_60px_-20px_rgba(212,255,58,0.35)]">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob: URL preview
                  <img src={previewUrl} alt="Your story card" className="animate-fade h-full w-full object-cover" />
                ) : (
                  <div className="skeleton h-full w-full rounded-none" />
                )}
              </div>
            </div>

            <div className="mt-5 text-center">
              <h2 className="text-[22px] leading-tight font-black">
                Share to your story to unlock <span className="text-volt">{nextType ? REVEAL_LABEL[nextType].toLowerCase() : 'a hint'}</span>
              </h2>
              <p className="mt-1 text-sm text-mute">Your link gets copied so you can add it as a link sticker 🔗</p>
            </div>

            {notice && <p className="mt-3 text-center text-sm font-semibold text-amber">{notice}</p>}

            <div className="mt-5 space-y-2">
              {phase === 'error' ? (
                <button onClick={() => setAttempt((a) => a + 1)} className="btn-primary">
                  Try again
                </button>
              ) : !fallback ? (
                <button onClick={shareToStory} disabled={phase !== 'ready'} className="btn-insta">
                  {phase === 'preparing' || phase === 'unlocking' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>
                      <InstagramIcon size={20} /> Share to Instagram Story
                    </>
                  )}
                </button>
              ) : (
                <div className="animate-rise space-y-2 rounded-3xl border border-line bg-card p-4">
                  <p className="text-sm font-bold">Your browser can’t open Instagram directly. Do this instead:</p>
                  <ol className="list-inside list-decimal space-y-1 text-sm text-mute">
                    <li>Save your card</li>
                    <li>Post it to your Instagram story</li>
                    <li>Add a link sticker with your link</li>
                  </ol>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <a href={previewUrl ?? '#'} download={`vouch-${code}.png`} className="btn-ghost h-12 text-sm">
                      <Download size={16} /> Save card
                    </a>
                    <button onClick={copyLink} className="btn-ghost h-12 text-sm">
                      <Copy size={16} /> Copy link
                    </button>
                  </div>
                  <button onClick={unlock} disabled={phase === 'unlocking'} className="btn-primary h-12 text-sm">
                    {phase === 'unlocking' ? <Loader2 className="animate-spin" /> : 'I posted it, unlock my hint'}
                  </button>
                </div>
              )}
              {!fallback && phase === 'ready' && (
                <button onClick={copyLink} className="btn h-11 text-sm text-mute">
                  <Copy size={15} /> {shareUrl.replace(/^https?:\/\//, '')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function HintTrack({ hints, highlight }: { hints: InboxItem['hints']; highlight: RevealType | null }) {
  const display = (type: RevealType, value: string | undefined) => {
    if (!value) return null
    if (value === 'unknown' || value === '?') return '🤫'
    if (type === 'gender') return GENDER_LABEL[value as Gender] ?? value
    if (type === 'grade') return GRADE_LABEL[value as Grade] ?? value
    return value
  }
  return (
    <div className="my-4 grid grid-cols-3 gap-2">
      {REVEAL_ORDER.map((type) => {
        const value = display(type, hints[type])
        return (
          <div
            key={type}
            className={`flex flex-col items-center gap-0.5 rounded-2xl border px-2 py-2.5 transition ${
              value ? 'border-volt/50 bg-volt/10' : 'border-line bg-card'
            } ${highlight === type ? 'animate-pop' : ''}`}
          >
            <span className="text-[10px] font-black tracking-widest text-mute uppercase">{REVEAL_LABEL[type]}</span>
            {value ? (
              <span className="text-sm font-black text-volt">{value}</span>
            ) : (
              <Lock size={14} className="my-0.5 text-mute" />
            )}
          </div>
        )
      })}
    </div>
  )
}
