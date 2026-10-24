/**
 * Twemoji file name for an emoji: lowercase hex code points joined by "-".
 * FE0F (variation selector) is dropped unless the sequence contains a ZWJ —
 * same rule twemoji itself uses.
 */
export function emojiCodepoints(emoji: string) {
  const raw = emoji.includes('\u200d') ? emoji : emoji.replace(/\ufe0f/g, '')
  return Array.from(raw)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-')
}
