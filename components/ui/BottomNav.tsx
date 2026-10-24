'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Flame, Inbox, UserRound } from 'lucide-react'

const TABS = [
  { href: '/vote', label: 'Vote', Icon: Flame },
  { href: '/inbox', label: 'Inbox', Icon: Inbox },
  { href: '/me', label: 'You', Icon: UserRound },
] as const

export function BottomNav({ unread }: { unread: number }) {
  const pathname = usePathname()
  // Layouts don't re-render on client navigation, so clear the badge locally
  // once the inbox has been opened (the server marks it seen).
  const [openedInbox, setOpenedInbox] = useState(false)
  const showBadge = unread > 0 && !openedInbox && !pathname.startsWith('/inbox')
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-ink/85 backdrop-blur-xl">
      <div className="safe-bottom mx-auto flex max-w-md items-stretch justify-around px-4 pt-2">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <Link
              key={href}
              href={href}
              prefetch
              onClick={href === '/inbox' ? () => setOpenedInbox(true) : undefined}
              className={`relative flex w-20 flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-bold transition ${
                active ? 'text-volt' : 'text-mute hover:text-white'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={24} strokeWidth={active ? 2.6 : 2} />
              {label}
              {href === '/inbox' && showBadge && (
                <span className="absolute top-0 right-4 flex h-5 min-w-5 items-center justify-center rounded-full bg-hot px-1.5 text-[11px] font-black text-white ring-2 ring-ink">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
