/**
 * Procedural audio system using Web Audio API.
 * All sounds are synthesized — no external audio files needed.
 */

import { getSfxVolume, subscribeVolume } from './volume-control'

let audioCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (audioCtx) return audioCtx
  try {
    audioCtx = new AudioContext()
  } catch {
    // Web Audio not available
    return null
  }
  return audioCtx
}

/** Resume audio context after user gesture (required by browsers). */
export function resumeAudio(): void {
  const ctx = getContext()
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume()
  }
}

// ---------------------------------------------------------------------------
// Collector hum — a low droning magnetic sound
// ---------------------------------------------------------------------------

interface CollectorHum {
  gainNode: GainNode
  oscillators: OscillatorNode[]
  /** Unsubscribe handle for the volume-control listener. */
  unsubVolume: () => void
}

let collectorHum: CollectorHum | null = null

/** Steady-state collector-hum master gain — used by both the initial
 *  ramp-in and the live volume-slider listener so they agree on the
 *  perceived level. */
const COLLECTOR_HUM_GAIN = 0.055

/** Start the collector hum sound. Idempotent — safe to call every frame. */
export function startCollectorHum(): void {
  if (collectorHum) return
  const ctx = getContext()
  if (!ctx) return

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)
  gain.gain.linearRampToValueAtTime(COLLECTOR_HUM_GAIN * getSfxVolume(), ctx.currentTime + 0.15)
  gain.connect(ctx.destination)

  // Live volume tracking: the collector hum holds its gain between calls
  // (unlike the engine/drill loops, which re-apply per frame). Without this
  // subscription, moving the SFX slider during a collect would leave the
  // hum at whatever level it started at. The listener tweens to the new
  // target so a slider drag glides smoothly instead of snapping.
  const unsubVolume = subscribeVolume(() => {
    if (!collectorHum || !audioCtx) return
    collectorHum.gainNode.gain.setTargetAtTime(
      COLLECTOR_HUM_GAIN * getSfxVolume(),
      audioCtx.currentTime,
      0.08,
    )
  })

  const oscillators: OscillatorNode[] = []

  // Base drone — low saw wave
  const osc1 = ctx.createOscillator()
  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(55, ctx.currentTime)
  const filt1 = ctx.createBiquadFilter()
  filt1.type = 'lowpass'
  filt1.frequency.setValueAtTime(200, ctx.currentTime)
  osc1.connect(filt1)
  filt1.connect(gain)
  osc1.start()
  oscillators.push(osc1)

  // Harmonic hum — sine at 110 Hz
  const osc2 = ctx.createOscillator()
  osc2.type = 'sine'
  osc2.frequency.setValueAtTime(110, ctx.currentTime)
  const gain2 = ctx.createGain()
  gain2.gain.setValueAtTime(0.035, ctx.currentTime)
  osc2.connect(gain2)
  gain2.connect(gain)
  osc2.start()
  oscillators.push(osc2)

  // Wobble — slow LFO modulating the drone pitch
  const lfo = ctx.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(3, ctx.currentTime)
  const lfoGain = ctx.createGain()
  lfoGain.gain.setValueAtTime(4, ctx.currentTime)
  lfo.connect(lfoGain)
  lfoGain.connect(osc1.frequency)
  lfo.start()
  oscillators.push(lfo)

  collectorHum = { gainNode: gain, oscillators, unsubVolume }
}

/** Stop the collector hum sound. Idempotent. */
export function stopCollectorHum(): void {
  if (!collectorHum) return
  const ctx = getContext()
  if (!ctx) return

  const { gainNode, oscillators, unsubVolume } = collectorHum
  gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2)

  // Schedule stop after fade-out
  const stopTime = ctx.currentTime + 0.25
  for (const osc of oscillators) {
    osc.stop(stopTime)
  }

  // Drop the volume listener so a stopped hum doesn't keep responding to
  // slider changes (and so the closure-held reference can be GC'd).
  unsubVolume()
  collectorHum = null
}

// ---------------------------------------------------------------------------
// Collect "pling" — short metallic ping when a chunk is absorbed
// ---------------------------------------------------------------------------

/** Play a short metallic collect sound. */
export function playCollectPling(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime

  // Metallic ping — high sine with fast decay
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  const baseFreq = 800 + Math.random() * 400
  osc.frequency.setValueAtTime(baseFreq, now)
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.5, now + 0.05)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.07 * getSfxVolume(), now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.25)
}

/** Clean up audio resources. */
export function disposeAudio(): void {
  stopCollectorHum()
  if (audioCtx) {
    void audioCtx.close()
    audioCtx = null
  }
}
