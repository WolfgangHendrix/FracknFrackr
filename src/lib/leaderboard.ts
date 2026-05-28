/**
 * Local leaderboard storage. Persists in localStorage as a single sorted
 * array, top-25 capped. Initials are limited to 3 uppercase characters in
 * arcade tradition so the column always lines up.
 *
 * Kept deliberately local-only for v1 — the hooks are here so a remote
 * sync can be layered on later without changing call sites.
 */

const STORAGE_KEY = 'fracking-asteroids-leaderboard'
const MAX_ENTRIES = 25

export interface LeaderboardEntry {
  initials: string
  score: number
  timestamp: number
}

function sanitizeInitials(raw: string): string {
  // 3 uppercase letters / digits max; pad with '-' so short entries still
  // render in the same column width as full ones.
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
  return (cleaned + '---').slice(0, 3)
}

export function loadLeaderboard(): LeaderboardEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): LeaderboardEntry[] => {
      if (
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).initials === 'string' &&
        typeof (item as Record<string, unknown>).score === 'number' &&
        typeof (item as Record<string, unknown>).timestamp === 'number'
      ) {
        const e = item as LeaderboardEntry
        return [{ initials: sanitizeInitials(e.initials), score: e.score, timestamp: e.timestamp }]
      }
      return []
    })
  } catch {
    return []
  }
}

/**
 * Insert a score and return the resulting board. Sorts descending by score,
 * caps to MAX_ENTRIES. Returns the new rank (1-indexed) or null if the
 * score didn't make the cut.
 */
export function recordScore(
  rawInitials: string,
  score: number,
): { board: LeaderboardEntry[]; rank: number | null } {
  const board = loadLeaderboard()
  const entry: LeaderboardEntry = {
    initials: sanitizeInitials(rawInitials || '---'),
    score: Math.max(0, Math.floor(score)),
    timestamp: Date.now(),
  }
  board.push(entry)
  board.sort((a, b) => b.score - a.score || a.timestamp - b.timestamp)
  const trimmed = board.slice(0, MAX_ENTRIES)
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  }
  const rankIndex = trimmed.findIndex(
    (e) => e.timestamp === entry.timestamp && e.score === entry.score,
  )
  return {
    board: trimmed,
    rank: rankIndex === -1 ? null : rankIndex + 1,
  }
}

/**
 * Would this score make the leaderboard? Used to decide whether to prompt
 * for initials at end-of-run.
 */
export function wouldMakeBoard(score: number): boolean {
  if (score <= 0) return false
  const board = loadLeaderboard()
  if (board.length < MAX_ENTRIES) return true
  return score > board[board.length - 1].score
}
