'use client'

import { RotateCcw } from 'lucide-react'

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="text-5xl">😵‍💫</div>
      <h1 className="text-2xl font-black">Something glitched</h1>
      <p className="max-w-xs text-sm text-mute">Probably a bad connection. Give it another shot.</p>
      <button onClick={reset} className="btn-primary mt-2 w-auto px-8">
        <RotateCcw size={18} /> Try again
      </button>
    </div>
  )
}
