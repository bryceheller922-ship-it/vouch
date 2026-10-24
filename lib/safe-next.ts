/** Only allow same-origin relative redirects (blocks open-redirects like //evil.com). */
export function safeNext(next: string | null | undefined, fallback = '/vote') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
