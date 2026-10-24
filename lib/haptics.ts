/** Best-effort haptic tap (Android Chrome; iOS ignores it). */
export function haptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    /* noop */
  }
}
