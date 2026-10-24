'use client'

import { useEffect } from 'react'

export function Toast({ message, onClose, tone = 'default' }: { message: string | null; onClose: () => void; tone?: 'default' | 'error' }) {
  useEffect(() => {
    if (!message) return
    const id = setTimeout(onClose, 2800)
    return () => clearTimeout(id)
  }, [message, onClose])

  if (!message) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 safe-top">
      <div
        role="status"
        className={`animate-rise rounded-2xl px-4 py-3 text-sm font-bold shadow-2xl ${
          tone === 'error' ? 'bg-hot text-white' : 'bg-white text-ink'
        }`}
      >
        {message}
      </div>
    </div>
  )
}
