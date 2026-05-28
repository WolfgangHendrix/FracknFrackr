/**
 * Erase every piece of player-owned state from localStorage. Used by the
 * "Erase All Data" option in the main menu and gated behind an explicit
 * confirmation step in the UI.
 *
 * Every key written by the game is prefixed with `fracking-asteroids-` (see
 * useGamePersistence, leaderboard, slot-summaries, drone-tutorial flag,
 * last-initials), so we can scan + delete by prefix without enumerating
 * each individual key — and any new key we add later will be covered as
 * long as it follows the prefix convention.
 */

const KEY_PREFIX = 'fracking-asteroids'

export function wipeAllGameData(): number {
  if (typeof localStorage === 'undefined') return 0
  const doomed: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(KEY_PREFIX)) doomed.push(key)
  }
  for (const key of doomed) localStorage.removeItem(key)
  return doomed.length
}
