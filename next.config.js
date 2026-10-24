// @ts-check

/**
 * vouch.school — Next.js config
 *
 * Caching strategy
 *  - /_next/static/*  → already `immutable` (content-hashed) by Next/Vercel.
 *  - /_next/image     → optimized avatars cached 30 days at the CDN.
 *  - public/ assets   → 1 day fresh + 7 days stale-while-revalidate.
 *  - /api/og/*        → sets its own CDN cache headers (see the route).
 *  - /api/vote        → never cached (per-user, mutating).
 */

/** Hostname of the Supabase project, used for next/image remote patterns. */
function supabaseHostname() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname
  } catch {
    return '**.supabase.co'
  }
}

const isProd = process.env.VERCEL_ENV === 'production'

/** @type {{ key: string, value: string }[]} */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Only block framing in production so preview tooling can still embed the app.
  ...(isProd ? [{ key: 'X-Frame-Options', value: 'DENY' }] : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    deviceSizes: [384, 640, 828, 1080],
    imageSizes: [48, 64, 96, 128, 192, 256],
    remotePatterns: [
      { protocol: 'https', hostname: supabaseHostname(), pathname: '/storage/v1/object/public/**' },
      // `supabase start` local stack
      { protocol: 'http', hostname: '127.0.0.1', port: '54321', pathname: '/storage/v1/object/public/**' },
    ],
  },

  // The OG route reads fonts + emoji SVGs from disk; make sure they ship with the function.
  outputFileTracingIncludes: {
    '/api/og/poll': ['./assets/fonts/**/*', './assets/emoji/**/*'],
  },

  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/:all*(svg|png|jpg|jpeg|webp|avif|ico|woff2)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/api/vote',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
      },
    ]
  },

  async redirects() {
    return [
      { source: '/home', destination: '/vote', permanent: true },
      { source: '/play', destination: '/vote', permanent: true },
    ]
  },
}

module.exports = nextConfig
