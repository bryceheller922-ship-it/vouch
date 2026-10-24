'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, AtSign, Check, Loader2, Lock, Search, Users } from 'lucide-react'
import { AvatarUploader } from '@/components/me/AvatarUploader'
import { REF_STORAGE_KEY } from '@/lib/constants'
import { errorCode, friendlyError } from '@/lib/errors'
import { GENDER_LABEL, GRADE_LABEL } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { createClient } from '@/lib/supabase/client'
import { GENDERS, GRADES, type Gender, type Grade, type MyProfile, type SchoolOption } from '@/lib/types'

const STEPS = ['school', 'handle', 'about', 'photo', 'done'] as const
type Step = (typeof STEPS)[number]

const HANDLE_RE = /^[a-z0-9._]{1,30}$/
const GENDER_EMOJI: Record<Gender, string> = { guy: '🙋‍♂️', girl: '🙋‍♀️', nonbinary: '🙋' }
const GRADE_EMOJI: Record<Grade, string> = { freshman: '🐣', sophomore: '🌱', junior: '🔥', senior: '👑', grad: '🎓' }

export function OnboardingFlow({ profile }: { profile: MyProfile }) {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('school')
  const [query, setQuery] = useState('')
  const [schools, setSchools] = useState<SchoolOption[] | null>(null)
  const [school, setSchool] = useState<SchoolOption | null>(null)
  const [handle, setHandle] = useState(profile.instagram_handle ?? '')
  const [name, setName] = useState(profile.display_name ?? '')
  const [grade, setGrade] = useState<Grade | null>(profile.grade)
  const [gender, setGender] = useState<Gender | null>(profile.gender)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stepIndex = STEPS.indexOf(step)
  const progress = Math.min(100, Math.round((stepIndex / (STEPS.length - 1)) * 100))

  // Debounced school search.
  useEffect(() => {
    let cancelled = false
    const id = setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_schools', { p_query: query })
      if (cancelled) return
      if (error) setError(friendlyError(error))
      else setSchools((data ?? []) as SchoolOption[])
    }, query ? 180 : 0)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [query, supabase])

  const normalizedHandle = useMemo(() => handle.trim().replace(/^@+/, '').toLowerCase(), [handle])
  const handleValid = HANDLE_RE.test(normalizedHandle)
  const nameValid = name.trim().length >= 1 && name.trim().length <= 40

  const go = useCallback((next: Step) => {
    setError(null)
    setStep(next)
    haptic()
    window.scrollTo({ top: 0 })
  }, [])

  function back() {
    if (stepIndex > 0 && step !== 'done' && step !== 'photo') go(STEPS[stepIndex - 1])
  }

  async function submit() {
    if (!school || !grade || !gender) return
    setSaving(true)
    setError(null)
    const ref = typeof window !== 'undefined' ? localStorage.getItem(REF_STORAGE_KEY) : null
    const { error } = await supabase.rpc('complete_onboarding', {
      p_school_id: school.id,
      p_instagram_handle: normalizedHandle,
      p_display_name: name.trim(),
      p_grade: grade,
      p_gender: gender,
      p_ref_code: ref,
    })
    setSaving(false)
    if (error) {
      const code = errorCode(error)
      setError(friendlyError(error))
      haptic([10, 40, 10])
      if (code === 'instagram_handle_taken' || code === 'invalid_instagram_handle' || code === 'invalid_display_name') setStep('handle')
      if (code === 'school_email_required' || code === 'school_locked') setStep('school')
      return
    }
    localStorage.removeItem(REF_STORAGE_KEY)
    haptic([8, 30, 8, 30, 8])
    go('photo')
  }

  function finish() {
    router.replace('/vote')
    router.refresh()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      {/* Progress */}
      <header className="safe-top sticky top-0 z-10 -mx-5 bg-ink/80 px-5 pb-3 backdrop-blur-xl">
        <div className="flex h-11 items-center gap-3">
          <button
            onClick={back}
            disabled={stepIndex === 0 || step === 'photo' || step === 'done'}
            className="flex h-10 w-10 items-center justify-center rounded-full text-mute transition hover:bg-card hover:text-white disabled:opacity-0"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-card">
            <div
              className="h-full rounded-full bg-gradient-to-r from-volt to-sky transition-all duration-500 ease-out"
              style={{ width: `${Math.max(progress, 6)}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs font-black text-mute tabular-nums">
            {Math.min(stepIndex + 1, 4)}/4
          </span>
        </div>
      </header>

      <div key={step} className="animate-rise flex flex-1 flex-col pb-8">
        {step === 'school' && (
          <>
            <StepTitle emoji="🏫" title="Where do you go?" subtitle="You’ll only see people from your school." />
            <label className="relative mt-6 block">
              <Search className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-mute" size={20} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search schools or cities"
                aria-label="Search schools"
                className="input pl-12"
              />
            </label>
            {error && <p className="mt-3 text-sm font-semibold text-hot">{error}</p>}
            <ul className="mt-4 space-y-2">
              {schools === null &&
                Array.from({ length: 5 }).map((_, i) => <li key={i} className="skeleton h-[68px]" />)}
              {schools?.length === 0 && (
                <li className="card p-5 text-center text-sm text-mute">
                  No schools match “{query}”. Email <span className="text-white">hi@vouch.school</span> to add yours.
                </li>
              )}
              {schools?.map((s) => {
                const locked = s.requires_school_email && !s.email_matches
                return (
                  <li key={s.id}>
                    <button
                      disabled={locked}
                      onClick={() => {
                        setSchool(s)
                        go('handle')
                      }}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition active:scale-[0.98] ${
                        s.email_matches ? 'border-volt/60 bg-volt/10' : 'border-line bg-card hover:bg-raised'
                      } ${locked ? 'opacity-50' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-bold">{s.name}</div>
                        <div className="flex items-center gap-2 text-xs text-mute">
                          <span>{s.city}</span>
                          {s.student_count > 0 && (
                            <span className="inline-flex items-center gap-1">
                              · <Users size={12} /> {s.student_count.toLocaleString()}
                            </span>
                          )}
                        </div>
                        {locked && (
                          <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-amber">
                            <Lock size={11} /> Log in with your @{s.email_domain} email to join
                          </div>
                        )}
                      </div>
                      {s.email_matches ? (
                        <span className="rounded-full bg-volt px-2 py-1 text-[11px] font-black text-ink">✓ verified</span>
                      ) : (
                        <ArrowRight size={18} className="text-mute" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}

        {step === 'handle' && (
          <>
            <StepTitle emoji="📸" title="What’s your @?" subtitle={`So people at ${school?.name ?? 'school'} can find you.`} />
            <div className="mt-6 space-y-3">
              <label className="relative block">
                <AtSign className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-mute" size={20} />
                <input
                  autoFocus
                  value={handle}
                  onChange={(e) => setHandle(e.target.value.replace(/\s/g, ''))}
                  placeholder="instagram handle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label="Instagram handle"
                  maxLength={31}
                  className={`input pl-12 ${handle && !handleValid ? 'border-hot' : ''}`}
                />
                {handleValid && <Check className="absolute top-1/2 right-4 -translate-y-1/2 text-volt" size={20} strokeWidth={3} />}
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First name"
                autoComplete="given-name"
                aria-label="First name"
                maxLength={40}
                className="input"
              />
              <p className="px-1 text-xs text-mute">
                Your first name and @ show up when classmates vote. Use your real name so friends recognize you.
              </p>
            </div>
            {error && <p className="mt-3 text-sm font-semibold text-hot">{error}</p>}
            <div className="mt-auto pt-8">
              <button disabled={!handleValid || !nameValid} onClick={() => go('about')} className="btn-primary">
                Continue <ArrowRight size={20} strokeWidth={3} />
              </button>
            </div>
          </>
        )}

        {step === 'about' && (
          <>
            <StepTitle emoji="🎒" title="Quick vibe check" subtitle="Used only for anonymous hints like “a Junior guy voted you”." />
            <h3 className="mt-6 mb-2 text-xs font-black tracking-[0.18em] text-mute uppercase">Your grade</h3>
            <div className="grid grid-cols-3 gap-2">
              {GRADES.map((g) => (
                <ChoiceChip key={g} active={grade === g} onClick={() => { setGrade(g); haptic() }} emoji={GRADE_EMOJI[g]} label={GRADE_LABEL[g]} />
              ))}
            </div>
            <h3 className="mt-6 mb-2 text-xs font-black tracking-[0.18em] text-mute uppercase">You are a</h3>
            <div className="grid grid-cols-3 gap-2">
              {GENDERS.map((g) => (
                <ChoiceChip key={g} active={gender === g} onClick={() => { setGender(g); haptic() }} emoji={GENDER_EMOJI[g]} label={GENDER_LABEL[g]} />
              ))}
            </div>
            <div className="mt-5 flex gap-2 rounded-2xl border border-line bg-card p-3 text-xs text-mute">
              <Lock size={14} className="mt-0.5 shrink-0 text-volt" />
              Your gender is never shown on your profile. It only appears as a hint someone unlocks after you vote for them.
            </div>
            {error && <p className="mt-3 text-sm font-semibold text-hot">{error}</p>}
            <div className="mt-auto pt-8">
              <button disabled={!grade || !gender || saving} onClick={submit} className="btn-primary">
                {saving ? <Loader2 className="animate-spin" /> : <>Join {school?.name ?? 'school'} <ArrowRight size={20} strokeWidth={3} /></>}
              </button>
            </div>
          </>
        )}

        {step === 'photo' && (
          <>
            <StepTitle emoji="🤳" title="Add a pic" subtitle="People are 3× more likely to vote for a face they recognize." />
            <div className="mt-10 flex justify-center">
              <AvatarUploader userId={profile.id} name={name} initialPath={profile.avatar_url} size={144} />
            </div>
            <div className="mt-auto space-y-2 pt-8">
              <button onClick={() => go('done')} className="btn-primary">
                Looks good <ArrowRight size={20} strokeWidth={3} />
              </button>
              <button onClick={() => go('done')} className="btn h-12 text-sm text-mute">
                Skip for now
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="relative mb-6">
              <span className="animate-burst absolute inset-0 rounded-full bg-volt/40" />
              <div className="animate-pop flex h-28 w-28 items-center justify-center rounded-full bg-volt text-6xl">🎉</div>
            </div>
            <h1 className="text-[36px] leading-tight font-black tracking-tight">You’re in, {name.trim().split(' ')[0]}!</h1>
            <p className="mt-2 max-w-xs text-mute">
              Today’s polls at <span className="font-bold text-white">{school?.name}</span> are live. Vote for people
              to hype them up, and they’ll vote for you too.
            </p>
            <button onClick={finish} className="btn-primary mt-10">
              Start voting 🔥
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

function StepTitle({ emoji, title, subtitle }: { emoji: string; title: string; subtitle: string }) {
  return (
    <div className="pt-6">
      <div className="mb-3 text-5xl">{emoji}</div>
      <h1 className="text-[32px] leading-tight font-black tracking-tight">{title}</h1>
      <p className="mt-1.5 text-mute">{subtitle}</p>
    </div>
  )
}

function ChoiceChip({ active, onClick, emoji, label }: { active: boolean; onClick: () => void; emoji: string; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-center gap-1 rounded-2xl border py-3 text-sm font-bold transition active:scale-95 ${
        active ? 'border-volt bg-volt text-ink' : 'border-line bg-card hover:bg-raised'
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      {label}
    </button>
  )
}
