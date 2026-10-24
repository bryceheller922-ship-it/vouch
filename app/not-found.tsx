import Link from 'next/link'
import { Logo } from '@/components/ui/Logo'

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <div className="text-6xl">🫠</div>
      <h1 className="text-3xl font-black">This link went missing</h1>
      <p className="text-mute">It may have expired, or the person deleted their account.</p>
      <Link href="/" className="btn-primary mt-2">
        Go to vouch
      </Link>
    </main>
  )
}
