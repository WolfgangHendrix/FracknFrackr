'use client'

/**
 * Voice-over playback helper. Routes dialogue clips (vo_arbeter*, vo_fracker*)
 * through the SFX channel so master/SFX sliders apply, and re-applies the
 * current volume live while a clip is playing — moving the slider mid-line
 * changes the loudness immediately rather than only affecting the next clip.
 *
 * Returns the underlying HTMLAudioElement so callers can still pause(),
 * await `ended`, or hold a ref for cleanup, exactly like `new Audio(src)`.
 */

import { getSfxVolume, subscribeVolume } from '@/game/volume-control'

export function playVoice(
  src: string,
  baseGain = 1,
  onPlayError?: () => void,
): HTMLAudioElement {
  const audio = new Audio(src)
  audio.preload = 'auto'
  audio.volume = baseGain * getSfxVolume()

  const unsub = subscribeVolume(() => {
    audio.volume = baseGain * getSfxVolume()
  })

  const cleanup = (): void => {
    unsub()
    audio.removeEventListener('ended', cleanup)
    audio.removeEventListener('pause', onPause)
  }
  // Unsubscribe on natural end so we don't leak listeners across long
  // sessions. Pausing without ending (e.g. a component unmount) also drops
  // the subscription — the audio element is about to be GC'd anyway.
  const onPause = (): void => {
    if (audio.ended) cleanup()
  }
  audio.addEventListener('ended', cleanup, { once: true })
  audio.addEventListener('pause', onPause)

  void audio.play().catch(() => {
    // Autoplay blocked / load failed — caller may want to drive a fallback
    // (e.g. advance dialogue on a text-length estimate when audio won't play).
    onPlayError?.()
  })

  return audio
}
