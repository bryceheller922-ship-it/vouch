import Link from 'next/link'

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="#d4ff3a" />
      <path d="M16 33.5 27 44l21-24" fill="none" stroke="#09090b" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ href = '/', size = 28 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2" aria-label="vouch home">
      <LogoMark size={size} />
      <span className="text-[22px] font-black tracking-tight">
        vouch<span className="text-volt">.</span>
      </span>
    </Link>
  )
}
