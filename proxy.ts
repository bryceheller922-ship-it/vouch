import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Next.js 16 Proxy (formerly middleware). Runs in front of every page request
 * to keep the Supabase session fresh and gate protected routes.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Skip: static assets, image optimizer, metadata files, the OG image
     * route and the vote API (it refreshes its own session cookie).
     */
    '/((?!_next/static|_next/image|api/og|api/vote|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|ttf|woff2?)$).*)',
  ],
}
