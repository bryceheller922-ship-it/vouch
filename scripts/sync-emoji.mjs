#!/usr/bin/env node
/**
 * Copies the Twemoji SVGs used by the story/OG images into assets/emoji/ so
 * image generation never depends on a third-party CDN at request time.
 *
 * Sources: every emoji in supabase/seed.sql + a few used in static copy.
 * Re-run after adding questions with new emoji:  node scripts/sync-emoji.mjs
 * (Unknown emoji still render — they fall back to the Twemoji CDN.)
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/@twemoji/svg')
const out = join(root, 'assets/emoji')
const UI_EMOJI = ['👀', '🔥', '✨', '💌', '🏆']

function codepoints(emoji) {
  const raw = emoji.includes('\u200d') ? emoji : emoji.replace(/\ufe0f/g, '')
  return Array.from(raw).map((c) => c.codePointAt(0).toString(16)).join('-')
}

if (!existsSync(src)) {
  console.error('Install dev deps first: npm i (needs @twemoji/svg)')
  process.exit(1)
}
mkdirSync(out, { recursive: true })

const seed = readFileSync(join(root, 'supabase/seed.sql'), 'utf8')
const fromSeed = [...seed.matchAll(/,\s*'(\p{Extended_Pictographic}[^']*)'\s*\)/gu)].map((m) => m[1])
const all = [...new Set([...fromSeed, ...UI_EMOJI])]

let copied = 0
const missing = []
for (const e of all) {
  const file = `${codepoints(e)}.svg`
  if (existsSync(join(src, file))) {
    copyFileSync(join(src, file), join(out, file))
    copied++
  } else missing.push(`${e} (${file})`)
}
console.log(`copied ${copied} emoji → assets/emoji (${readdirSync(out).length} total)`)
if (missing.length) console.log('not in twemoji (will use CDN fallback):', missing.join(', '))
