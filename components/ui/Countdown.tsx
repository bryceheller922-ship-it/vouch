'use client'

import { useEffect, useRef, useState } from 'react'

function format(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Ticks down to `target`; calls onDone exactly once when it hits zero. */
export function Countdown({ target, onDone }: { target: string; onDone?: () => void }) {
  const [now, setNow] = useState<number | null>(null)
  const fired = useRef(false)
  const onDoneRef = useRef(onDone)

  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    fired.current = false
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (!fired.current && new Date(target).getTime() - t <= 0) {
        fired.current = true
        onDoneRef.current?.()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [target])

  const remaining = now === null ? null : new Date(target).getTime() - now
  return <span className="tabular-nums">{remaining === null ? '--:--:--' : format(remaining)}</span>
}
