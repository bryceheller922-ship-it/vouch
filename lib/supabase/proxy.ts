import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from '@/lib/env'

const PROTECTED_PREFIXES = ['/vote', '/inbox', '/me', '/onboarding']
const AUTH_PAGES = ['/login']

/**
 * Refreshes the Supabase session cookie on every matched request and applies
 * coarse auth redirects. Fine-grained checks (e.g. onboarding complete) live in
 * the server layouts so this stays a single, fast JWT check.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  if (!isSupabaseConfigured) return response

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value))
      },
    },
  })

  // IMPORTANT: no code between createServerClient and getClaims().
  // getClaims() verifies the JWT (locally when asymmetric signing keys are on).
  const { data } = await supabase.auth.getClaims()
  const isAuthed = Boolean(data?.claims?.sub)

  const { pathname, search } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!isAuthed && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', `${pathname}${search}`)
    return redirectWithCookies(url, response)
  }

  if (isAuthed && (AUTH_PAGES.includes(pathname) || pathname === '/')) {
    const url = request.nextUrl.clone()
    url.pathname = '/vote'
    url.search = ''
    return redirectWithCookies(url, response)
  }

  return response
}

/** Redirect while preserving any refreshed auth cookies. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((c) => redirect.cookies.set(c))
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'cache-control' || key.toLowerCase() === 'expires' || key.toLowerCase() === 'pragma') {
      redirect.headers.set(key, value)
    }
  })
  return redirect
}
