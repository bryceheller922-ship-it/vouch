'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'
import { prepareAvatar } from '@/lib/image'

interface Props {
  userId: string
  name: string | null
  initialPath: string | null
  size?: number
  onUploaded?: (path: string) => void
}

/** Tap-to-upload avatar. Writes to storage `avatars/<uid>/…` then saves the path. */
export function AvatarUploader({ userId, name, initialPath, size = 112, onUploaded }: Props) {
  const supabase = createClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [path, setPath] = useState(initialPath)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Pick an image file.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const blob = await prepareAvatar(file)
      const newPath = `${userId}/avatar-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(newPath, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
      if (upErr) throw upErr

      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: newPath }).eq('id', userId)
      if (dbErr) throw dbErr

      if (path && path !== newPath) await supabase.storage.from('avatars').remove([path])
      setPath(newPath)
      onUploaded?.(newPath)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-full ring-4 ring-volt/20 transition active:scale-95"
        aria-label="Change profile photo"
      >
        <Avatar id={userId} name={name} path={path} size={size} />
        <span className="absolute right-0 bottom-0 flex h-9 w-9 items-center justify-center rounded-full bg-volt text-ink ring-4 ring-ink">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} strokeWidth={2.6} />}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <p className="text-xs font-semibold text-hot">{error}</p>}
    </div>
  )
}
