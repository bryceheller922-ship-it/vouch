import { SUPABASE_URL } from '@/lib/env'
import type { Gender, Grade, Hints, PollCategory, RevealType } from '@/lib/types'

export const GRADE_LABEL: Record<Grade, string> = {
  freshman: 'Freshman',
  sophomore: 'Sophomore',
  junior: 'Junior',
  senior: 'Senior',
  grad: 'Grad',
}

export const GENDER_LABEL: Record<Gender, string> = {
  guy: 'Guy',
  girl: 'Girl',
  nonbinary: 'Non-binary',
}

export const REVEAL_LABEL: Record<RevealType, string> = {
  gender: 'Gender',
  grade: 'Grade',
  initial: 'First initial',
}

export const CATEGORY_GRADIENT: Record<PollCategory, string> = {
  vibes: 'from-violet to-hot',
  style: 'from-hot to-amber',
  brains: 'from-sky to-violet',
  hype: 'from-volt to-sky',
  funny: 'from-amber to-volt',
  kind: 'from-hot to-violet',
  future: 'from-sky to-volt',
}

function gradeLabel(value: string | undefined) {
  return value && value in GRADE_LABEL ? GRADE_LABEL[value as Grade] : null
}

function genderNoun(value: string | undefined) {
  if (value === 'guy') return 'guy'
  if (value === 'girl') return 'girl'
  if (value === 'nonbinary') return 'person'
  return null
}

/**
 * Turns unlocked hints into a subject phrase.
 *   {}                                   → "Someone"
 *   { gender: 'guy' }                    → "A guy"
 *   { gender: 'guy', grade: 'junior' }   → "A Junior guy"
 *   + { initial: 'J' }                   → "A Junior guy (J…)"
 */
export function hintSubject(hints: Hints, { capitalize = true } = {}) {
  const grade = gradeLabel(hints.grade)
  const noun = genderNoun(hints.gender)
  let subject: string
  if (grade && noun) subject = `a ${grade} ${noun}`
  else if (noun) subject = `a ${noun}`
  else if (grade) subject = `a ${grade}`
  else subject = 'someone'
  if (hints.initial && hints.initial !== '?') subject += ` (${hints.initial}…)`
  return capitalize ? subject.charAt(0).toUpperCase() + subject.slice(1) : subject
}

/** "It was a Sophomore guy" style sentence for the reveal moment. */
export function hintSentence(hints: Hints) {
  const parts: string[] = []
  const grade = gradeLabel(hints.grade)
  const noun = genderNoun(hints.gender)
  if (grade && noun) parts.push(`It was a ${grade} ${noun}`)
  else if (noun) parts.push(`It was a ${noun}`)
  else if (grade) parts.push(`It was a ${grade}`)
  else parts.push('It was someone at your school')
  if (hints.initial && hints.initial !== '?') parts.push(`whose name starts with “${hints.initial}”`)
  return parts.join(' ')
}

/** Human copy for a single freshly unlocked hint. */
export function hintValueLabel(type: RevealType, value: string) {
  if (value === 'unknown' || value === '?') return 'They kept this one secret 🤫'
  if (type === 'gender') return `They’re a ${genderNoun(value) ?? value}`
  if (type === 'grade') return `They’re a ${gradeLabel(value) ?? value}`
  return `Their name starts with “${value}”`
}

export function timeAgo(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Public URL for an object path stored in profiles.avatar_url. */
export function avatarSrc(path: string | null | undefined) {
  if (!path) return null
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

export function initials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

/** Deterministic gradient per user so avatars are stable. */
export function avatarGradient(seed: string) {
  const palettes = [
    ['#D4FF3A', '#3AD7FF'],
    ['#FF3D8B', '#7C5CFF'],
    ['#7C5CFF', '#3AD7FF'],
    ['#FFB23A', '#FF3D8B'],
    ['#3AD7FF', '#D4FF3A'],
    ['#FF3D8B', '#FFB23A'],
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
  const [a, b] = palettes[Math.abs(hash) % palettes.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

export function pluralize(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`
}
