import Link from 'next/link'
import { ArrowRight, Lock, ShieldCheck, Sparkles, Vote, Share2 } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { avatarGradient } from '@/lib/format'

const DEMO_NOMINEES = [
  { name: 'Maya R.', grade: 'Junior' },
  { name: 'Jordan T.', grade: 'Senior' },
  { name: 'Priya K.', grade: 'Junior' },
  { name: 'Leo M.', grade: 'Sophomore' },
]

const STEPS = [
  { Icon: Sparkles, title: 'Pick your school', body: 'Join with your school email or Instagram @. Only people at your school can see you.' },
  { Icon: Vote, title: 'Vote on daily brackets', body: '12 new superlatives drop every midnight. Tap a classmate, get the next one instantly.' },
  { Icon: Share2, title: 'Share to unlock hints', body: 'Got vouched? Post your card to your story to reveal hints about who picked you.' },
]

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5">
      <header className="safe-top flex items-center justify-between py-3">
        <Logo />
        <Link href="/login" className="rounded-full border border-line px-4 py-2 text-sm font-bold hover:bg-card">
          Log in
        </Link>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="animate-rise pt-8 pb-10 text-center">
          <span className="chip mx-auto mb-5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-volt" /> live at 25+ schools
          </span>
          <h1 className="text-[44px] leading-[0.95] font-black tracking-tight">
            Find out who’s <span className="glow-text">hyping you.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xs text-[17px] text-mute">
            Anonymous compliments from people at your school. Vote daily. Get vouched.
          </p>
          <Link href="/login" className="btn-primary mt-7">
            Get vouched <ArrowRight size={20} strokeWidth={3} />
          </Link>
          <p className="mt-3 text-xs font-semibold text-mute">Free · 30 seconds · compliments only</p>
        </section>

        {/* Demo poll card */}
        <section aria-label="Example poll" className="relative pb-12">
          <div className="card animate-float relative mx-auto max-w-sm p-5 shadow-[0_30px_80px_-30px_rgba(124,92,255,0.6)]">
            <div className="mb-1 flex items-center justify-between text-xs font-bold text-mute">
              <span>3 of 12</span>
              <span className="chip py-0.5">future</span>
            </div>
            <div className="my-4 text-center">
              <div className="text-5xl">🦄</div>
              <p className="mt-3 text-[22px] leading-tight font-black">Most likely to build a unicorn startup</p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {DEMO_NOMINEES.map((n, i) => (
                <div
                  key={n.name}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-3 ${
                    i === 2 ? 'border-volt bg-volt/10' : 'border-line bg-raised'
                  }`}
                >
                  <div className="h-11 w-11 rounded-full" style={{ background: avatarGradient(n.name) }} />
                  <div className="text-center">
                    <div className="text-sm font-bold">{n.name}</div>
                    <div className="text-[11px] text-mute">{n.grade}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="absolute -bottom-1 left-1/2 w-[88%] -translate-x-1/2 rotate-[-2deg] rounded-2xl border border-line bg-raised px-4 py-3 text-sm shadow-2xl">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👗</span>
              <div className="flex-1">
                <div className="font-bold">A Junior guy voted you</div>
                <div className="text-mute">“Best dressed”</div>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-volt text-ink">
                <Lock size={16} strokeWidth={3} />
              </span>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="space-y-3 py-10">
          <h2 className="mb-4 text-center text-sm font-black tracking-[0.2em] text-mute uppercase">How it works</h2>
          {STEPS.map(({ Icon, title, body }, i) => (
            <div key={title} className="card flex gap-4 p-4" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-volt text-ink">
                <Icon size={22} strokeWidth={2.6} />
              </div>
              <div>
                <h3 className="font-black">{title}</h3>
                <p className="text-sm text-mute">{body}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Safety */}
        <section className="card mb-10 flex gap-4 border-volt/30 bg-volt/5 p-5">
          <ShieldCheck className="shrink-0 text-volt" size={28} />
          <div>
            <h3 className="font-black">Compliments only. Always.</h3>
            <p className="mt-1 text-sm text-mute">
              Every question is positive and hand-picked. No DMs, no comments, no free text. Votes are anonymous by
              design. Not even other students can query who voted.
            </p>
          </div>
        </section>

        <Link href="/login" className="btn-primary mb-6">
          Find your school <ArrowRight size={20} strokeWidth={3} />
        </Link>
      </main>

      <footer className="safe-bottom flex items-center justify-between border-t border-line py-5 text-xs text-mute">
        <span>© {new Date().getFullYear()} vouch.school</span>
        <span>Made for students 🫶</span>
      </footer>
    </div>
  )
}
