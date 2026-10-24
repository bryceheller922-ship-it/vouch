'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, AtSign, Loader2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { haptic } from '@/lib/haptics'
import { REF_STORAGE_KEY } from '@/lib/constants'

/** Must match Auth → Providers → Email → "Email OTP length" (Supabase default: 6). */
const OTP_LENGTH = 6
const RESEND_SECONDS = 30

type Step = 'email' | 'code'

export function LoginForm({ next, refCode, initialError }: { next: string; refCode: string | null; initialError: string | null }) {
  const router = useRouter()
  const supabase = createClient()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError ? 'That link expired. Request a new code.' : null)
  const [resendIn, setResendIn] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  // Remember who invited us so onboarding can credit them.
  useEffect(() => {
    if (refCode && /^[a-z0-9]{4,18}$/.test(refCode)) localStorage.setItem(REF_STORAGE_KEY, refCode)
  }, [refCode])

  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  const isSchoolEmail = /@[^@]+\.(edu|k12\.[a-z]{2}\.us|ac\.[a-z]{2})$/i.test(email.trim())

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    const value = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('Enter a valid email.')
      haptic([10, 40, 10])
      return
    }
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: value,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    setLoading(false)
    if (error) {
      setError(error.message.includes('rate') ? 'Too many tries. Wait a minute and try again.' : error.message)
      haptic([10, 40, 10])
      return
    }
    setEmail(value)
    setStep('code')
    setResendIn(RESEND_SECONDS)
    haptic()
    setTimeout(() => codeRef.current?.focus(), 50)
  }

  async function verify(token: string) {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (error) {
      setLoading(false)
      setCode('')
      setError('That code didn’t work. Check your email and try again.')
      haptic([10, 40, 10])
      codeRef.current?.focus()
      return
    }
    haptic([8, 30, 8])
    router.replace(next)
    router.refresh()
  }

  function onCodeChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setCode(digits)
    if (digits.length === OTP_LENGTH && !loading) void verify(digits)
  }

  if (step === 'code') {
    return (
      <div className="animate-rise">
        <button onClick={() => setStep('email')} className="mb-8 inline-flex items-center gap-1 text-sm font-bold text-mute hover:text-white">
          <ArrowLeft size={16} /> Change email
        </button>
        <div className="mb-2 text-5xl">📬</div>
        <h1 className="text-[34px] leading-tight font-black tracking-tight">Check your email</h1>
        <p className="mt-2 text-mute">
          We sent a {OTP_LENGTH}-digit code to <span className="font-bold text-white">{email}</span>
        </p>
        <form
          className="mt-8 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (code.length >= 6) void verify(code)
          }}
        >
          <input
            ref={codeRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={10}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            placeholder={'•'.repeat(OTP_LENGTH)}
            aria-label="Verification code"
            className={`input h-16 text-center text-3xl tracking-[0.5em] ${error ? 'animate-shake border-hot' : ''}`}
          />
          {error && <p className="text-sm font-semibold text-hot">{error}</p>}
          <button type="submit" disabled={loading || code.length < 6} className="btn-primary">
            {loading ? <Loader2 className="animate-spin" /> : <>Verify <ArrowRight size={20} strokeWidth={3} /></>}
          </button>
          <button type="button" disabled={resendIn > 0 || loading} onClick={() => sendCode()} className="btn-ghost h-12 text-sm">
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
        </form>
        <p className="mt-6 text-center text-xs text-mute">Tip: you can also tap the magic link in the email.</p>
      </div>
    )
  }

  return (
    <div className="animate-rise">
      <div className="mb-2 text-5xl">👋</div>
      <h1 className="text-[34px] leading-tight font-black tracking-tight">Let’s get you in</h1>
      <p className="mt-2 text-mute">Use your school email to get verified instantly.</p>

      <form onSubmit={sendCode} className="mt-8 space-y-3">
        <label className="relative block">
          <Mail className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-mute" size={20} />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            aria-label="Email"
            className={`input pl-12 ${error ? 'animate-shake border-hot' : ''}`}
          />
          {isSchoolEmail && (
            <span className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-volt px-2 py-0.5 text-[11px] font-black text-ink">
              ✓ school
            </span>
          )}
        </label>
        {error && <p className="text-sm font-semibold text-hot">{error}</p>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="animate-spin" /> : <>Send my code <ArrowRight size={20} strokeWidth={3} /></>}
        </button>
      </form>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-line bg-card p-4">
        <span className="btn-insta h-9 w-9 shrink-0 rounded-xl p-0">
          <AtSign size={18} strokeWidth={2.8} />
        </span>
        <p className="text-sm text-mute">
          <span className="font-bold text-white">Instagram people:</span> any email works. You’ll claim your @ on the next
          screen so friends can find you.
        </p>
      </div>

      <p className="mt-8 text-center text-xs leading-relaxed text-mute">
        By continuing you agree to keep it kind. Vouch is compliments-only and for students 13+.
      </p>
    </div>
  )
}
