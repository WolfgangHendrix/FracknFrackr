/**
 * Online leaderboard backed by Supabase. Surface mirrors the local
 * leaderboard so callers can route to either depending on whether the
 * Supabase client is configured. The table contract is:
 *
 *   table public.leaderboard_entries
 *     id         uuid    pk default gen_random_uuid()
 *     initials   char(3)
 *     score      integer
 *     created_at timestamptz default now()
 *
 * with public read + public insert RLS policies (see README for SQL).
 *
 * All errors are caught — the online board is best-effort. If Supabase
 * is offline or misconfigured the game keeps running on local scores.
 */
import { getSupabase, isSupabaseConfigured } from './supabase'

const TABLE = 'leaderboard_entries'
const TOP_N = 25

export interface OnlineEntry {
  initials: string
  score: number
  /** ISO timestamp string from the Supabase column. */
  created_at: string
}

function sanitizeInitials(raw: string): string {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
  return (cleaned + '---').slice(0, 3)
}

export interface OnlineFetchResult {
  /** Top-N entries, descending by score. Empty when unavailable. */
  entries: OnlineEntry[]
  /** True if the call actually reached Supabase (vs. fail/not-configured). */
  ok: boolean
  /** Human-readable message when ok=false. */
  message?: string
}

export async function fetchTopOnline(): Promise<OnlineFetchResult> {
  if (!isSupabaseConfigured()) {
    return { entries: [], ok: false, message: 'Online board not configured.' }
  }
  const client = getSupabase()
  if (!client) return { entries: [], ok: false, message: 'Online board offline.' }
  try {
    const { data, error } = await client
      .from(TABLE)
      .select('initials, score, created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(TOP_N)
    if (error) {
      return { entries: [], ok: false, message: error.message }
    }
    return { entries: (data ?? []) as OnlineEntry[], ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error'
    return { entries: [], ok: false, message }
  }
}

export interface OnlineSubmitResult {
  ok: boolean
  message?: string
}

export async function submitOnlineScore(
  rawInitials: string,
  score: number,
): Promise<OnlineSubmitResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'Online board not configured.' }
  }
  const client = getSupabase()
  if (!client) return { ok: false, message: 'Online board offline.' }
  const initials = sanitizeInitials(rawInitials || '---')
  const cleanScore = Math.max(0, Math.floor(score))
  try {
    const { error } = await client.from(TABLE).insert({ initials, score: cleanScore })
    if (error) return { ok: false, message: error.message }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Network error'
    return { ok: false, message }
  }
}

/**
 * Convenience predicate — quickly check whether a fresh score is likely to
 * make the visible top-N. Caches the last fetch for 30 seconds so the
 * end-of-run prompt doesn't double-fetch.
 */
let cachedTopScores: number[] | null = null
let cachedAt = 0
const CACHE_TTL_MS = 30_000

export async function wouldMakeOnlineBoard(score: number): Promise<boolean> {
  if (score <= 0) return false
  if (!isSupabaseConfigured()) return false
  if (cachedTopScores && Date.now() - cachedAt < CACHE_TTL_MS) {
    if (cachedTopScores.length < TOP_N) return true
    return score > cachedTopScores[cachedTopScores.length - 1]
  }
  const { entries, ok } = await fetchTopOnline()
  if (!ok) return false
  cachedTopScores = entries.map((e) => e.score)
  cachedAt = Date.now()
  if (cachedTopScores.length < TOP_N) return true
  return score > cachedTopScores[cachedTopScores.length - 1]
}
