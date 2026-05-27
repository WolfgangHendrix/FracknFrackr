/**
 * Sound effects using Web Audio API — all procedurally synthesized.
 */

import { getSfxVolume } from './volume-control'

let audioCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (audioCtx) {
    // Browsers start the context suspended until a user gesture; resume so
    // menu/UI sounds triggered from clicks and gamepad input are audible.
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  }
  try {
    audioCtx = new AudioContext()
  } catch {
    return null
  }
  return audioCtx
}

/** Share the audio context with the main audio module. */
export function setSfxContext(ctx: AudioContext): void {
  audioCtx = ctx
}

// ---------------------------------------------------------------------------
// Laser Fire — short chirpy zap
// ---------------------------------------------------------------------------

export function playLaserFire(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(880, now)
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.08)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.035 * getSfxVolume(), now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(600, now)
  filter.Q.setValueAtTime(2, now)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.1)
}

// ---------------------------------------------------------------------------
// Explosion — low boom with noise burst
// ---------------------------------------------------------------------------

export function playExplosion(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime

  // Noise burst
  const bufferSize = ctx.sampleRate * 0.3
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08))
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'lowpass'
  noiseFilter.frequency.setValueAtTime(800, now)
  noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.3)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.1 * getSfxVolume(), now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)

  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(now)

  // Low thump
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(80, now)
  osc.frequency.exponentialRampToValueAtTime(20, now + 0.2)

  const oscGain = ctx.createGain()
  oscGain.gain.setValueAtTime(0.12 * getSfxVolume(), now)
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)

  osc.connect(oscGain)
  oscGain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.3)
}

// ---------------------------------------------------------------------------
// Player Hit — sharp impact with distortion
// ---------------------------------------------------------------------------

export function playPlayerHit(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(200, now)
  osc.frequency.exponentialRampToValueAtTime(60, now + 0.15)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.09 * getSfxVolume(), now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1200, now)
  filter.frequency.exponentialRampToValueAtTime(200, now + 0.15)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.2)

  // Additional high-frequency crack
  const crack = ctx.createOscillator()
  crack.type = 'square'
  crack.frequency.setValueAtTime(2000, now)
  crack.frequency.exponentialRampToValueAtTime(500, now + 0.05)

  const crackGain = ctx.createGain()
  crackGain.gain.setValueAtTime(0.04 * getSfxVolume(), now)
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06)

  crack.connect(crackGain)
  crackGain.connect(ctx.destination)
  crack.start(now)
  crack.stop(now + 0.06)
}

// ---------------------------------------------------------------------------
// Engine Thrust — filtered noise loop, controlled externally
// ---------------------------------------------------------------------------

interface EngineSound {
  source: AudioBufferSourceNode
  gain: GainNode
  filter: BiquadFilterNode
}

let engineSound: EngineSound | null = null

export function startEngineSound(): void {
  if (engineSound) return
  const ctx = getContext()
  if (!ctx) return

  // Create a looping noise buffer
  const duration = 1
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(60, ctx.currentTime)
  filter.Q.setValueAtTime(1, ctx.currentTime)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  source.start()

  engineSound = { source, gain, filter }
}

/** Update engine sound based on ship speed (0 to 1 normalized). */
export function updateEngineSound(speedNormalized: number): void {
  if (!engineSound || !audioCtx) return

  const vol = speedNormalized * 0.032 * getSfxVolume()
  const freq = 60 + speedNormalized * 200

  engineSound.gain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.05)
  engineSound.filter.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05)
}

/** Mute the engine loop (e.g. when paused). Keeps source alive for resume. */
export function suspendEngineSound(): void {
  if (!engineSound || !audioCtx) return
  engineSound.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05)
}

/** Unmute the engine loop after suspend. */
export function resumeEngineSound(): void {
  // Volume will be set by the next updateEngineSound call, nothing needed here.
}

export function stopEngineSound(): void {
  if (!engineSound) return
  try {
    engineSound.source.stop()
  } catch {
    // already stopped
  }
  engineSound = null
}

// ---------------------------------------------------------------------------
// Arbiter Siren — pulsing red-alert klaxon while The Arbiter closes in
// ---------------------------------------------------------------------------

interface ArbiterSiren {
  masterGain: GainNode
  /** LFO sweeping the pitch into a repeating rising whoop. */
  pitchLFO: OscillatorNode
  /** LFO chopping the amplitude into distinct klaxon beats. */
  pulseLFO: OscillatorNode
  /** Every oscillator node, so they can all be stopped on dispose. */
  oscNodes: OscillatorNode[]
}

let arbiterSiren: ArbiterSiren | null = null

/** Start the looping Arbiter red-alert klaxon. Idempotent. */
export function startArbiterSiren(): void {
  if (arbiterSiren) return
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime

  // Master volume — driven by updateArbiterSiren()
  const masterGain = ctx.createGain()
  masterGain.gain.setValueAtTime(0, now)
  masterGain.connect(ctx.destination)

  // Klaxon beat — amplitude chopped on/off so it honks instead of droning
  const pulseGain = ctx.createGain()
  pulseGain.gain.setValueAtTime(0.45, now)
  pulseGain.connect(masterGain)

  const pulseLFO = ctx.createOscillator()
  pulseLFO.type = 'triangle'
  pulseLFO.frequency.setValueAtTime(1.4, now)
  const pulseDepth = ctx.createGain()
  pulseDepth.gain.setValueAtTime(0.55, now)
  pulseLFO.connect(pulseDepth)
  pulseDepth.connect(pulseGain.gain)

  // Bandpass keeps the harsh saw tone tight and alarm-like
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(1150, now)
  filter.Q.setValueAtTime(2.5, now)
  filter.connect(pulseGain)

  // Pitch sweep — a sawtooth LFO ramps the pitch up then snaps it back,
  // giving the classic rising "whoop ... whoop" red-alert sweep.
  const pitchLFO = ctx.createOscillator()
  pitchLFO.type = 'sawtooth'
  pitchLFO.frequency.setValueAtTime(1.4, now)
  const pitchDepth = ctx.createGain()
  pitchDepth.gain.setValueAtTime(220, now)
  pitchLFO.connect(pitchDepth)

  // Two slightly detuned saws give the klaxon a harsh, beating body
  const oscNodes: OscillatorNode[] = []
  for (const detune of [-9, 9]) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(480, now)
    osc.detune.setValueAtTime(detune, now)
    pitchDepth.connect(osc.frequency)
    osc.connect(filter)
    osc.start(now)
    oscNodes.push(osc)
  }

  pitchLFO.start(now)
  pulseLFO.start(now)

  arbiterSiren = { masterGain, pitchLFO, pulseLFO, oscNodes }
}

/**
 * Update the klaxon — louder and faster as the Arbiter nears.
 * @param intensity 0 (far) → 1 (arrived)
 */
export function updateArbiterSiren(intensity: number): void {
  if (!arbiterSiren || !audioCtx) return
  const clamped = Math.max(0, Math.min(1, intensity))
  const now = audioCtx.currentTime

  const vol = (0.05 + clamped * 0.11) * getSfxVolume()
  arbiterSiren.masterGain.gain.setTargetAtTime(vol, now, 0.1)

  // Both LFOs share the rate so the pitch sweep and the beat stay locked;
  // the alarm quickens from a steady 1.1 Hz to an urgent 2.4 Hz.
  const rate = 1.1 + clamped * 1.3
  arbiterSiren.pitchLFO.frequency.setTargetAtTime(rate, now, 0.15)
  arbiterSiren.pulseLFO.frequency.setTargetAtTime(rate, now, 0.15)
}

/** Stop the Arbiter klaxon with a short fade-out. Idempotent. */
export function stopArbiterSiren(): void {
  if (!arbiterSiren) return
  const ctx = audioCtx
  if (ctx) {
    arbiterSiren.masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
    const stopAt = ctx.currentTime + 0.45
    try {
      arbiterSiren.pitchLFO.stop(stopAt)
      arbiterSiren.pulseLFO.stop(stopAt)
      for (const osc of arbiterSiren.oscNodes) osc.stop(stopAt)
    } catch {
      // already stopped
    }
  }
  arbiterSiren = null
}

// ---------------------------------------------------------------------------
// Klaxon — emergency warning siren
// ---------------------------------------------------------------------------

/**
 * Play a short emergency warning blip.
 * @param variant - 'low' for low-HP warning, 'high' for Arbiter jump warning.
 */
export function playKlaxon(variant: 'low' | 'high' = 'low'): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime
  const duration = 0.6
  const freq = variant === 'low' ? 140 : 520

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq, now)
  // Slight pitch slide for that classic siren feel
  osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + duration * 0.4)
  osc.frequency.exponentialRampToValueAtTime(freq, now + duration)

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(freq * 3, now)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(0.08 * getSfxVolume(), now + 0.05)
  gain.gain.linearRampToValueAtTime(0, now + duration)

  osc.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + duration)
}

// ---------------------------------------------------------------------------
// UI / menu sounds — all procedurally synthesized
// ---------------------------------------------------------------------------

/** Soft blip when the active menu highlight moves. */
export function playMenuMove(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(420, now)
  osc.frequency.exponentialRampToValueAtTime(640, now + 0.05)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.07 * getSfxVolume(), now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.1)
}

/**
 * Confirming two-note blip when a menu selection is made — a soft, low
 * rising fourth (G3 → C4) on a triangle voice through a lowpass, matching
 * the game's minimal low-frequency sound palette.
 */
export function playMenuSelect(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime
  const vol = getSfxVolume()

  // Shared lowpass keeps the blip warm and free of high-end fizz.
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(700, now)
  filter.connect(ctx.destination)

  const notes = [196, 262]
  for (let i = 0; i < notes.length; i++) {
    const t = now + i * 0.08
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(notes[i], t)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.055 * vol, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)

    osc.connect(gain)
    gain.connect(filter)
    osc.start(t)
    osc.stop(t + 0.15)
  }
}

/** Bright cascade of coin pings when materials are sold. */
export function playSellChime(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime
  const vol = getSfxVolume()
  const freqs = [1318, 1760, 2093, 2637]
  for (let i = 0; i < freqs.length; i++) {
    const t = now + i * 0.06
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freqs[i], t)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.08 * vol, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.32)
  }
}

/** Cash-register "ka-ching" when an upgrade is purchased. */
export function playBuyRegister(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime
  const vol = getSfxVolume()

  // "Ka" — short mechanical click (filtered noise burst)
  const bufferSize = Math.floor(ctx.sampleRate * 0.08)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.015))
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const noiseFilter = ctx.createBiquadFilter()
  noiseFilter.type = 'bandpass'
  noiseFilter.frequency.setValueAtTime(1800, now)
  noiseFilter.Q.setValueAtTime(1, now)
  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.12 * vol, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
  noise.connect(noiseFilter)
  noiseFilter.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(now)

  // "Ching" — bright two-tone bell ringing out after the click
  const t = now + 0.07
  const bell = [2093, 2794]
  for (const freq of bell) {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, t)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.075 * vol, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.52)
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export function disposeSfx(): void {
  stopEngineSound()
  stopArbiterSiren()
  // Don't close ctx — shared with main audio module
  audioCtx = null
}
