import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Hot path of the voting loop.
 *
 * Runs on the Node.js runtime with Vercel Fluid Compute (one warm instance
 * serves many concurrent requests) pinned to the same region as the Supabase
 * database (vercel.json → "regions"). Each call is exactly ONE database round
 * trip: `cast_vote` validates + records the vote and returns the next round.
 *
 * (Edge runtime is deprecated in Next.js 16 — and a DB-bound loop is faster
 * next to the DB than at a far-away edge POP anyway.)
 */
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Body =
  | { action: 'vote'; poll_id: string; nominee_id: string }
  | { action: 'skip'; poll_id: string }
  | { action: 'next' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: NextRequest) {
  // Cheap CSRF guard: browsers always send Origin on cross-site POSTs.
  const origin = request.headers.get('origin')
  if (origin) {
    const allowed = [request.headers.get('x-forwarded-host'), request.headers.get('host')].filter(Boolean)
    let originHost = ''
    try {
      originHost = new URL(origin).host
    } catch {
      /* malformed */
    }
    if (!allowed.includes(originHost)) return json({ error: 'bad_origin' }, 403)
  }

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const supabase = await createClient()

  let result
  switch (body?.action) {
    case 'vote':
      if (!UUID_RE.test(body.poll_id) || !UUID_RE.test(body.nominee_id)) return json({ error: 'invalid_ids' }, 400)
      result = await supabase.rpc('cast_vote', { p_poll_id: body.poll_id, p_nominee_id: body.nominee_id })
      break
    case 'skip':
      if (!UUID_RE.test(body.poll_id)) return json({ error: 'invalid_ids' }, 400)
      result = await supabase.rpc('skip_poll', { p_poll_id: body.poll_id })
      break
    case 'next':
      result = await supabase.rpc('get_next_round')
      break
    default:
      return json({ error: 'invalid_action' }, 400)
  }

  if (result.error) {
    const message = result.error.message ?? 'error'
    const status = /not_authenticated|JWT/i.test(message) ? 401 : 400
    return json({ error: message }, status)
  }
  return json({ round: result.data })
}
