import Image from 'next/image'
import { avatarGradient, avatarSrc, initials } from '@/lib/format'

interface AvatarProps {
  id: string
  name: string | null
  path: string | null
  size?: number
  className?: string
}

/** Uploaded photo if present, otherwise a deterministic gradient + initials. */
export function Avatar({ id, name, path, size = 56, className = '' }: AvatarProps) {
  const src = avatarSrc(path)
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size, background: src ? '#1b1b20' : avatarGradient(id) }}
    >
      {src ? (
        <Image src={src} alt={name ?? 'avatar'} fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center font-black text-ink/85"
          style={{ fontSize: Math.round(size * 0.38) }}
        >
          {initials(name)}
        </span>
      )}
    </div>
  )
}
