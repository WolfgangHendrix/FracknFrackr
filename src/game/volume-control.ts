/**
 * Central volume control — Master / Music / SFX sliders + a pause-time
 * dampening multiplier. Audio modules read the getters here when scaling
 * gain on a new sound; for continuously-playing nodes the music module
 * also re-applies its target on volume change (see music.ts).
 *
 * Values persist in localStorage so pause-menu adjustments survive a
 * reload. Read on first import — no module init required by callers.
 */

const STORAGE_KEY = 'fracking-asteroids-volume-v1'
/** Multiplier applied to all output while the game is paused — keeps the
 *  menu legible without fully muting in-game ambience. */
const PAUSE_DAMPEN = 0.35

interface VolumeSnapshot {
  master: number
  music: number
  sfx: number
}

const DEFAULTS: VolumeSnapshot = {
  master: 1.0,
  music: 0.22,
  sfx: 0.65,
}

let state: VolumeSnapshot = { ...DEFAULTS }
let dampening = false

// --- Persistence ---------------------------------------------------------

function loadFromStorage(): VolumeSnapshot {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<VolumeSnapshot>
    return {
      master: clamp01(parsed.master ?? DEFAULTS.master),
      music: clamp01(parsed.music ?? DEFAULTS.music),
      sfx: clamp01(parsed.sfx ?? DEFAULTS.sfx),
    }
  } catch {
    // Corrupted storage entry — fall back to defaults rather than crashing.
    return { ...DEFAULTS }
  }
}

function saveToStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or denied — silently drop. The next session will revert
    // to defaults, but the running game continues unaffected.
  }
}

state = loadFromStorage()

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

// --- Subscriptions -------------------------------------------------------
//
// The music module multiplies its master gain by getMusicVolume() at the
// moment a slider moves; subscribers let it (or any other future continuous
// node) re-apply gain live without polling.

type Listener = () => void
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l()
}

export function subscribeVolume(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// --- Reads ---------------------------------------------------------------
//
// Each getter folds in master × dampening so callers don't have to remember.
// The raw slider values are exposed via `get*Raw` for UI display.

export function getMasterVolume(): number {
  return state.master * (dampening ? PAUSE_DAMPEN : 1)
}

export function getMusicVolume(): number {
  return state.music * getMasterVolume()
}

export function getSfxVolume(): number {
  return state.sfx * getMasterVolume()
}

export function getMasterVolumeRaw(): number {
  return state.master
}
export function getMusicVolumeRaw(): number {
  return state.music
}
export function getSfxVolumeRaw(): number {
  return state.sfx
}

// --- Writes --------------------------------------------------------------

export function setMasterVolume(v: number): void {
  state.master = clamp01(v)
  saveToStorage()
  notify()
}

export function setMusicVolume(v: number): void {
  state.music = clamp01(v)
  saveToStorage()
  notify()
}

export function setSfxVolume(v: number): void {
  state.sfx = clamp01(v)
  saveToStorage()
  notify()
}

/**
 * Toggle the pause-dampen multiplier. Page layer calls `true` on pause,
 * `false` on resume; volume getters fold it in transparently. Notifies
 * subscribers so continuous sounds (music) glide to the new level.
 */
export function setPauseDampening(on: boolean): void {
  if (dampening === on) return
  dampening = on
  notify()
}

export function isPauseDampening(): boolean {
  return dampening
}
