/**
 * Pause-menu user preferences — accessibility toggles persisted to
 * localStorage. Separate from {@link ./volume-control} because these are
 * boolean toggles, not gain values, and they live behind a Settings panel
 * rather than always-visible sliders.
 *
 * Reads happen synchronously on first import; writes flush to storage
 * immediately. Subscribers are notified so the scene can re-apply post-FX
 * gates the moment the user flips a toggle.
 */

const STORAGE_KEY = 'fracking-asteroids-pause-settings-v1'

interface Settings {
  /** Camera trauma → world shake. Off helps motion-sensitive players. */
  screenShake: boolean
  /**
   * Bloom/vignette/chromatic-aberration intensity. Off keeps the scene
   * crisp during low-HP / smart-bomb moments instead of flaring brightly.
   */
  flashIntensity: boolean
  /** Quick-tip rotator in the pause menu footer. Off hides the tip line. */
  showTips: boolean
  /**
   * Retro render mode. Renders the scene to a low-res target with NEAREST
   * filtering and skips bloom, for an Atari-era chunky-pixel aesthetic.
   * Purely cosmetic — collisions and gameplay are unaffected.
   */
  retroMode: boolean
}

const DEFAULTS: Settings = {
  screenShake: true,
  flashIntensity: true,
  showTips: true,
  retroMode: false,
}

let state: Settings = { ...DEFAULTS }

function clampBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function loadFromStorage(): Settings {
  if (typeof window === 'undefined') return { ...DEFAULTS }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      screenShake: clampBool(parsed.screenShake, DEFAULTS.screenShake),
      flashIntensity: clampBool(parsed.flashIntensity, DEFAULTS.flashIntensity),
      showTips: clampBool(parsed.showTips, DEFAULTS.showTips),
      retroMode: clampBool(parsed.retroMode, DEFAULTS.retroMode),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveToStorage(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Silently ignore storage failures — the in-memory state stays correct
    // for this session.
  }
}

state = loadFromStorage()

type Listener = (s: Settings) => void
const listeners = new Set<Listener>()

function notify(): void {
  for (const l of listeners) l({ ...state })
}

export function subscribePauseSettings(listener: Listener): () => void {
  listeners.add(listener)
  // Fire once on subscribe so callers don't have to read separately.
  listener({ ...state })
  return () => {
    listeners.delete(listener)
  }
}

export function getPauseSettings(): Settings {
  return { ...state }
}

export function setScreenShake(on: boolean): void {
  if (state.screenShake === on) return
  state.screenShake = on
  saveToStorage()
  notify()
}

export function setFlashIntensity(on: boolean): void {
  if (state.flashIntensity === on) return
  state.flashIntensity = on
  saveToStorage()
  notify()
}

export function setShowTips(on: boolean): void {
  if (state.showTips === on) return
  state.showTips = on
  saveToStorage()
  notify()
}

export function setRetroMode(on: boolean): void {
  if (state.retroMode === on) return
  state.retroMode = on
  saveToStorage()
  notify()
}
