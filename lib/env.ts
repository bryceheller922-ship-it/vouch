/**
 * Public runtime configuration. `NEXT_PUBLIC_*` values are inlined at build
 * time, so each must be referenced literally (no dynamic process.env[key]).
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

/** Publishable key (sb_publishable_…) or the legacy anon key. */
export const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vouch.school').replace(/\/+$/, '')

/** e.g. "vouch.school" — used in short links printed on story images. */
export const SITE_HOST = (() => {
  try {
    return new URL(SITE_URL).host
  } catch {
    return 'vouch.school'
  }
})()

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY)
