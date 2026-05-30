'use client'

/**
 * Menu / gameplay music controller.
 *
 * Owns a single HTMLAudioElement that survives the StartScreen → game React
 * transition so the menu loop can play through into gameplay without a cut.
 *
 * Flow:
 *   playMenuLoop()    — loop mus_mainmenu_00.ogg on the start screen.
 *   enterGameplay()   — stop looping 00; when it ends naturally, swap to
 *                       mus_mainmenu_01.ogg and loop that for the rest of
 *                       gameplay. No-op if already in gameplay.
 *   playMenuLoop()    — called again on returning to the menu: hard-cuts 01
 *                       and restarts 00 from the top.
 */

import { getMusicVolume } from '@/game/volume-control'

const MENU_TRACK = './audio/mus_mainmenu_00.ogg'
const GAMEPLAY_TRACK = './audio/mus_mainmenu_01.ogg'

type Mode = 'idle' | 'menu' | 'handoff' | 'gameplay'

let audio: HTMLAudioElement | null = null
let mode: Mode = 'idle'
let onEndedHandler: (() => void) | null = null
let gestureCleanup: (() => void) | null = null
// Tracks whether the visibility handler paused us mid-playback. Without
// this we'd resume on tab-show even if the player had explicitly stopped
// the music for some other reason (or the volume slider muted it).
let pausedByVisibility = false
let visibilityHandlerInstalled = false

function installVisibilityHandler(): void {
  if (visibilityHandlerInstalled) return
  if (typeof document === 'undefined') return
  visibilityHandlerInstalled = true
  // The scene's own visibility handler silences in-game WebAudio loops
  // (engine, drill, siren, synthesized music layers) but the HTMLAudio
  // element holding the actual mp3/ogg music track is a different audio
  // pipeline entirely — without this listener it kept playing while the
  // tab was hidden, which is exactly what the player reported hearing.
  document.addEventListener('visibilitychange', () => {
    const a = audio
    if (!a) return
    if (document.hidden) {
      if (!a.paused) {
        pausedByVisibility = true
        a.pause()
      }
    } else if (pausedByVisibility) {
      pausedByVisibility = false
      void a.play().catch(() => {
        // Autoplay policy may have reset between hide/show — primeOnFirstGesture
        // will pick up on the next user input.
      })
    }
  })
}

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  if (!audio) {
    audio = new Audio()
    audio.preload = 'auto'
  }
  audio.volume = getMusicVolume()
  installVisibilityHandler()
  return audio
}

function clearEndedHandler(): void {
  if (audio && onEndedHandler) {
    audio.removeEventListener('ended', onEndedHandler)
  }
  onEndedHandler = null
}

/** Start (or restart) the menu loop. Idempotent when already in 'menu'. */
export function playMenuLoop(): void {
  const a = ensureAudio()
  if (!a) return

  if (mode === 'menu' && !a.paused && a.src.endsWith('mus_mainmenu_00.ogg')) {
    return // already playing the menu loop
  }

  clearEndedHandler()

  // Always (re)load to make the "return to menu" hard-cut deterministic.
  if (!a.src.endsWith('mus_mainmenu_00.ogg')) {
    a.src = MENU_TRACK
  } else {
    a.currentTime = 0
  }
  a.loop = true
  mode = 'menu'

  void a.play().catch(() => {
    // Autoplay blocked — primeOnFirstGesture() will retry on user input.
  })
}

/**
 * Transition into gameplay. If 00 is currently playing, keep it playing but
 * stop looping; when it ends, swap to 01 and loop. If we're somehow already
 * past that point, no-op.
 */
export function enterGameplay(): void {
  const a = ensureAudio()
  if (!a) return
  if (mode === 'gameplay' || mode === 'handoff') return

  a.loop = false
  mode = 'handoff'

  const handler = (): void => {
    if (!audio) return
    audio.src = GAMEPLAY_TRACK
    audio.loop = true
    audio.volume = getMusicVolume()
    mode = 'gameplay'
    void audio.play().catch(() => {})
  }
  onEndedHandler = handler
  a.addEventListener('ended', handler, { once: true })
}

/**
 * Install one-shot pointer/key listeners on window so the first user gesture
 * triggers audio.play() — required by browser autoplay policy. Self-removes
 * after firing once.
 */
export function primeOnFirstGesture(): void {
  if (typeof window === 'undefined') return
  if (gestureCleanup) return // already armed

  const fire = (): void => {
    const a = audio
    if (a && a.paused) {
      a.volume = getMusicVolume()
      void a.play().catch(() => {})
    }
    cleanup()
  }
  const cleanup = (): void => {
    window.removeEventListener('pointerdown', fire)
    window.removeEventListener('keydown', fire)
    window.removeEventListener('touchstart', fire)
    gestureCleanup = null
  }
  window.addEventListener('pointerdown', fire, { once: true })
  window.addEventListener('keydown', fire, { once: true })
  window.addEventListener('touchstart', fire, { once: true })
  gestureCleanup = cleanup
}

/** Apply the current music volume. Call when the volume slider changes. */
export function refreshMusicVolume(): void {
  if (audio) audio.volume = getMusicVolume()
}
