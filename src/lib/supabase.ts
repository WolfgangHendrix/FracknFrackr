/**
 * Lazy Supabase client. Lives behind `getSupabase()` so a build without
 * env vars set (e.g. the standalone itch.io upload, or a dev contributor
 * with no Supabase access) still ships without error — the online
 * leaderboard simply degrades to a "not configured" state.
 *
 * The anon key is safe to expose publicly — that's its purpose in Supabase
 * client-side auth. Row-level security on the leaderboard table is what
 * actually keeps writes safe, not key secrecy.
 *
 * Both env vars must be prefixed `NEXT_PUBLIC_` so Next.js inlines them
 * into the static export.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let cached: SupabaseClient | null = null
let resolved = false

export function isSupabaseConfigured(): boolean {
  return Boolean(URL && KEY)
}

export function getSupabase(): SupabaseClient | null {
  if (resolved) return cached
  resolved = true
  if (!URL || !KEY) return null
  cached = createClient(URL, KEY, {
    auth: {
      // We don't use auth; suppress the session-persistence machinery so
      // localStorage stays uncluttered by Supabase keys.
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return cached
}
