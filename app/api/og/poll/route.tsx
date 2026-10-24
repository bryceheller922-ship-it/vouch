import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { emojiCodepoints } from '@/lib/emoji'
import { SITE_HOST, SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env'
import type { SharePreview } from '@/lib/types'

/**
 * GET /api/og/poll?code=<share code>&format=story|og
 *
 *  story (default) → 1080×1920 PNG for Instagram Stories
 *  og              → 1200×630 PNG for link previews (iMessage, Twitter, Discord…)
 *
 * Only renders data for a real share code (never arbitrary query text), so
 * nobody can mint images with custom words on our domain.
 */

// Fonts are static: load once per instance (Fluid Compute reuses instances).
const fontsPromise = Promise.all([
  readFile(join(process.cwd(), 'assets/fonts/Geist-Black.ttf')),
  readFile(join(process.cwd(), 'assets/fonts/Geist-Bold.ttf')),
])

/**
 * Emoji are served from bundled Twemoji SVGs (assets/emoji, see
 * scripts/sync-emoji.mjs) so rendering never waits on a CDN. Unknown emoji fall
 * back to text, which satori resolves via the Twemoji CDN.
 */
type EmojiMap = Map<string, string | null>
const emojiCache: EmojiMap = new Map()

async function loadEmoji(list: string[]): Promise<EmojiMap> {
  await Promise.all(
    list.map(async (e) => {
      if (emojiCache.has(e)) return
      try {
        const svg = await readFile(join(process.cwd(), 'assets/emoji', `${emojiCodepoints(e)}.svg`))
        emojiCache.set(e, `data:image/svg+xml;base64,${svg.toString('base64')}`)
      } catch {
        emojiCache.set(e, null)
      }
    }),
  )
  return emojiCache
}

function Emoji({ e, size, map }: { e: string; size: number; map: EmojiMap }) {
  const uri = map.get(e)
  if (uri) {
    // eslint-disable-next-line @next/next/no-img-element -- satori renders <img>
    return <img src={uri} width={size} height={size} alt="" />
  }
  return <div style={{ display: 'flex', fontSize: size, lineHeight: 1 }}>{e}</div>
}

const C = {
  ink: '#09090b',
  card: '#131316',
  line: '#27272e',
  mute: '#8b8b97',
  volt: '#d4ff3a',
  hot: '#ff3d8b',
  violet: '#7c5cff',
  sky: '#3ad7ff',
}

/** Dev-only sample so designers can iterate on the card: /api/og/poll?demo=1 */
const DEMO_PREVIEW: SharePreview = {
  kind: 'vote',
  code: 'demo1234',
  question_text: 'Most likely to build a unicorn startup',
  emoji: '🦄',
  school_name: 'Marquette University',
  display_name: 'Maya',
  instagram_handle: 'maya.r',
  vote_count: 7,
}

async function loadPreview(code: string | null): Promise<SharePreview | null> {
  if (!code || !/^[a-z0-9]{4,18}$/.test(code) || !isSupabaseConfigured) return null
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('get_share_preview', { p_code: code })
  if (error || !data) return null
  return data as SharePreview
}

function Mark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        background: C.volt,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size * 0.72} height={size * 0.72} viewBox="0 0 64 64">
        <path d="M14 33.5 26 45l24-27" fill="none" stroke={C.ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

function Wordmark({ size }: { size: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.35 }}>
      <Mark size={size * 1.4} />
      <div style={{ display: 'flex', fontSize: size, fontWeight: 900, letterSpacing: -size * 0.04 }}>
        vouch<span style={{ color: C.volt }}>.school</span>
      </div>
    </div>
  )
}

/** Ambient glow. An SVG radialGradient renders reliably in resvg (CSS radial-gradient sizing does not). */
function Blobs({ w, h }: { w: number; h: number }) {
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      <defs>
        <radialGradient id="g1" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7c5cff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#7c5cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g2" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ff3d8b" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ff3d8b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={w * 0.1} cy={h * 0.12} r={Math.max(w, h) * 0.42} fill="url(#g1)" />
      <circle cx={w * 0.95} cy={h * 0.92} r={Math.max(w, h) * 0.45} fill="url(#g2)" />
    </svg>
  )
}

function fitQuestion(text: string, base: number) {
  if (text.length > 70) return Math.round(base * 0.68)
  if (text.length > 48) return Math.round(base * 0.8)
  if (text.length > 30) return Math.round(base * 0.9)
  return base
}

const STORY_CONTENT_W = 1080 - 84 * 2

function Story({ p, shortUrl, em }: { p: SharePreview | null; shortUrl: string; em: EmojiMap }) {
  const W = 1080
  const H = 1920
  const school = p?.school_name ?? 'your school'
  const isVote = p?.kind === 'vote' && p.question_text

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: C.ink,
        color: 'white',
        fontFamily: 'Geist',
        // Instagram covers ~250px top & bottom with UI chrome.
        padding: '230px 84px 260px',
        position: 'relative',
      }}
    >
      <Blobs w={W} h={H} />

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Wordmark size={54} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
        {isVote ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: STORY_CONTENT_W }}>
            <div style={{ display: 'flex', width: STORY_CONTENT_W, fontSize: 50, fontWeight: 700, color: C.mute, justifyContent: 'center', textAlign: 'center' }}>
              someone at {school} voted me
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginTop: 48,
                padding: '72px 64px 80px',
                borderRadius: 72,
                background: C.volt,
                color: C.ink,
                transform: 'rotate(-2.5deg)',
                boxShadow: '0 40px 120px rgba(212,255,58,0.35)',
              }}
            >
              <Emoji e={p!.emoji ?? '✨'} size={150} map={em} />
              <div
                style={{
                  display: 'flex',
                  marginTop: 36,
                  fontSize: fitQuestion(p!.question_text!, 104),
                  fontWeight: 900,
                  lineHeight: 1.0,
                  letterSpacing: -4,
                }}
              >
                “{p!.question_text}”
              </div>
            </div>
            {p!.vote_count > 1 && (
              <div style={{ display: 'flex', width: STORY_CONTENT_W, justifyContent: 'center', marginTop: 56 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    padding: '18px 34px',
                    borderRadius: 999,
                    border: `3px solid ${C.line}`,
                    background: C.card,
                    fontSize: 40,
                    fontWeight: 700,
                  }}
                >
                  <Emoji e="🔥" size={44} map={em} />
                  {p!.vote_count} votes and counting
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Emoji e="👀" size={180} map={em} />
            <div style={{ display: 'flex', marginTop: 30, fontSize: 112, fontWeight: 900, lineHeight: 1, letterSpacing: -4 }}>
              {p?.display_name ? `${p.display_name} is on vouch` : 'who’s hyping you?'}
            </div>
            <div style={{ display: 'flex', marginTop: 34, fontSize: 52, fontWeight: 700, color: C.mute }}>
              anonymous compliments from {school}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 60, fontWeight: 900, letterSpacing: -2 }}>
          who’s voting for you? <Emoji e="👀" size={64} map={em} />
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 34,
            padding: '30px 58px',
            borderRadius: 999,
            background: 'white',
            color: C.ink,
            fontSize: 50,
            fontWeight: 900,
            letterSpacing: -1,
          }}
        >
          {shortUrl}
        </div>
      </div>
    </div>
  )
}

function OgCard({ p, shortUrl, em }: { p: SharePreview | null; shortUrl: string; em: EmojiMap }) {
  const school = p?.school_name ?? 'your school'
  const isVote = p?.kind === 'vote' && p.question_text
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        background: C.ink,
        color: 'white',
        fontFamily: 'Geist',
        padding: 64,
        position: 'relative',
        alignItems: 'center',
        gap: 56,
      }}
    >
      <Blobs w={1200} h={630} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', justifyContent: 'space-between' }}>
        <Wordmark size={40} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 900, lineHeight: 1.02, letterSpacing: -2.5 }}>
            {isVote ? `${p!.display_name ?? 'Someone'} got vouched at ${school}` : 'Find out who’s hyping you.'}
          </div>
          <div style={{ display: 'flex', marginTop: 18, fontSize: 30, fontWeight: 700, color: C.mute }}>
            anonymous compliments from people at your school
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 900, color: C.volt }}>{shortUrl}</div>
      </div>
      {isVote && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 400,
            padding: '44px 40px',
            borderRadius: 44,
            background: C.volt,
            color: C.ink,
            transform: 'rotate(3deg)',
          }}
        >
          <Emoji e={p!.emoji ?? '✨'} size={92} map={em} />
          <div style={{ display: 'flex', marginTop: 18, fontSize: fitQuestion(p!.question_text!, 50), fontWeight: 900, lineHeight: 1.02, letterSpacing: -1.5 }}>
            “{p!.question_text}”
          </div>
        </div>
      )}
    </div>
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const format = searchParams.get('format') === 'og' ? 'og' : 'story'

  const isDemo = process.env.NODE_ENV === 'development' && searchParams.has('demo')
  const [[black, bold], preview] = await Promise.all([fontsPromise, isDemo ? DEMO_PREVIEW : loadPreview(code)])
  const shortUrl = preview ? `${SITE_HOST}/s/${preview.code}` : SITE_HOST
  const em = await loadEmoji([preview?.emoji ?? '✨', '👀', '🔥'])

  const size = format === 'og' ? { width: 1200, height: 630 } : { width: 1080, height: 1920 }

  return new ImageResponse(format === 'og' ? (
      <OgCard p={preview} shortUrl={shortUrl} em={em} />
    ) : (
      <Story p={preview} shortUrl={shortUrl} em={em} />
    ), {
    ...size,
    emoji: 'twemoji',
    fonts: [
      { name: 'Geist', data: black, weight: 900, style: 'normal' },
      { name: 'Geist', data: bold, weight: 700, style: 'normal' },
    ],
    headers: {
      // Valid codes: cache at the CDN, refresh in the background (vote_count changes).
      'Cache-Control': preview
        ? 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
        : 'public, max-age=60, s-maxage=300',
    },
  })
}
