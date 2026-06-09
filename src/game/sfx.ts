/**
 * Sound effects using Web Audio API — all procedurally synthesized.
 */

import { getSfxVolume } from './volume-control'
import type { AsteroidType } from './types'

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

/**
 * Pre-warm the WebAudio graph on the first user gesture so the very first
 * menu blip lands without the cold-start latency that otherwise comes from
 * an unresumed context + first-allocation jitter on the audio thread.
 *
 * We schedule a sub-audible click (0.5ms square pulse at -84 dB) so the
 * audio thread spins up its render loop before the player hits the next
 * UI element. Subsequent menu sounds then play with steady-state latency.
 */
let primed = false
export function primeAudio(): void {
  if (primed) return
  const ctx = getContext()
  if (!ctx) return
  primed = true
  // Wake the suspended context. resume() returns a Promise; we don't await
  // it because we want the prime work scheduled immediately — by the time
  // the audio thread processes our buffer the context state has flipped.
  if (ctx.state === 'suspended') void ctx.resume()
  const now = ctx.currentTime
  const buf = ctx.createBuffer(1, 64, ctx.sampleRate)
  const src = ctx.createBufferSource()
  src.buffer = buf
  const gain = ctx.createGain()
  // Effectively silent — just enough to force the graph to render.
  gain.gain.setValueAtTime(0.00005, now)
  src.connect(gain).connect(ctx.destination)
  src.start(now)
  src.stop(now + 0.001)
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
// Boost Whoosh — afterburner kick for the Thruster Vectoring dash
// ---------------------------------------------------------------------------

export function playBoostWhoosh(): void {
  const ctx = getContext()
  if (!ctx) return

  const now = ctx.currentTime
  const vol = getSfxVolume()

  // Bandpass-swept noise = the "whoosh" body. Center frequency sweeps up then
  // the gain decays, giving a punchy outrush.
  const bufferSize = ctx.sampleRate * 0.3
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.12))
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const bp = ctx.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.setValueAtTime(1.2, now)
  bp.frequency.setValueAtTime(300, now)
  bp.frequency.exponentialRampToValueAtTime(2200, now + 0.18)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.0001, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.18 * vol, now + 0.03)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28)

  noise.connect(bp)
  bp.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(now)

  // Rising tonal sweep underneath for a sense of acceleration.
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(140, now)
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.2)

  const oscGain = ctx.createGain()
  oscGain.gain.setValueAtTime(0.0001, now)
  oscGain.gain.exponentialRampToValueAtTime(0.08 * vol, now + 0.03)
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

  // Engine bumped slightly so it reads under other loops without dominating.
  const vol = speedNormalized * 0.04 * getSfxVolume()
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
// Drill Nose — looped grinder noise that swells while the ship is actively
// drilling an asteroid with its nose. Modeled on the engine sound (filtered
// noise + tween-on-volume) so the audio mix stays coherent.
// ---------------------------------------------------------------------------

interface DrillSound {
  source: AudioBufferSourceNode
  gain: GainNode
  /** Bandpass to give the noise a "grinder" timbre, not just white noise. */
  filter: BiquadFilterNode
  /** Pulse LFO that modulates the gain so the sound reads as mechanical. */
  pulseLFO: OscillatorNode
}

let drillSound: DrillSound | null = null

function ensureDrillSound(): DrillSound | null {
  if (drillSound) return drillSound
  const ctx = getContext()
  if (!ctx) return null

  // White-noise loop buffer, same trick as the engine sound.
  const duration = 1
  const bufferSize = ctx.sampleRate * duration
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.loop = true

  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(620, ctx.currentTime)
  filter.Q.setValueAtTime(2.5, ctx.currentTime)

  // Pulse stage: gain centered at 0.5, modulated by a ±0.5 LFO so the audio
  // is multiplied by [0, 1] at a 22 Hz "drrrrr" rhythm. Must sit upstream of
  // the volume stage — wiring the LFO directly into the final gain's
  // AudioParam (additive) leaves the pulse swinging ±0.5 even after the
  // intrinsic gain tweens to 0, which keeps the loop audibly buzzing after
  // the player stops drilling.
  const pulseGain = ctx.createGain()
  pulseGain.gain.setValueAtTime(0.5, ctx.currentTime)
  const pulseLFO = ctx.createOscillator()
  pulseLFO.frequency.setValueAtTime(22, ctx.currentTime)
  const pulseDepth = ctx.createGain()
  pulseDepth.gain.setValueAtTime(0.5, ctx.currentTime)
  pulseLFO.connect(pulseDepth).connect(pulseGain.gain)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, ctx.currentTime)

  source.connect(filter)
  filter.connect(pulseGain)
  pulseGain.connect(gain)
  gain.connect(ctx.destination)
  source.start()
  pulseLFO.start()

  drillSound = { source, gain, filter, pulseLFO }
  return drillSound
}

/**
 * Set the drill loop's intensity (0..1). 0 = silent, 1 = full volume. Smooth
 * via WebAudio's setTargetAtTime so flicker-on-/-off during a drill session
 * doesn't manifest as audible clicks.
 */
export function setDrillSoundIntensity(intensity: number): void {
  const s = intensity > 0.001 ? ensureDrillSound() : drillSound
  if (!s || !audioCtx) return
  // Drill peak volume targets ~0.05 post-pulse — the pulseGain swings the
  // signal between 0 and 1 (avg 0.5) before this stage, so we use ~10× the
  // engine's static gain so the perceived loudness lands near the engine
  // and collector hum without burying the music or the other ambient loops
  // the player keeps running while drilling.
  const target = Math.max(0, Math.min(1, intensity)) * 0.5 * getSfxVolume()
  s.gain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.05)
}

export function suspendDrillSound(): void {
  if (!drillSound || !audioCtx) return
  drillSound.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05)
}

export function stopDrillSound(): void {
  if (!drillSound) return
  try {
    drillSound.source.stop()
    drillSound.pulseLFO.stop()
  } catch {
    // already stopped
  }
  drillSound = null
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
/**
 * Cached AudioBuffer for the hover blip, rendered once on first play.
 * BufferSourceNode is the cheapest WebAudio playback path — far less
 * overhead than allocating + connecting an oscillator + gain envelope each
 * frame, which matters because this fires every time the cursor crosses
 * a menu item. Stored at unit volume; per-play gain applies the volume
 * control multiplier.
 */
let menuMoveBuffer: AudioBuffer | null = null

function buildMenuMoveBuffer(ctx: AudioContext): AudioBuffer {
  // 100ms of audio at the context's native rate. Generates a triangle
  // wave sweeping 420Hz → 640Hz with an exponential gain decay, matching
  // the procedural version we used to allocate per-play.
  const duration = 0.1
  const samples = Math.floor(ctx.sampleRate * duration)
  const buf = ctx.createBuffer(1, samples, ctx.sampleRate)
  const data = buf.getChannelData(0)
  // Short linear attack so the buffer doesn't begin mid-cycle at near-full
  // amplitude. Without this the very first sample lands near +0.97 (the
  // triangle wave at phase ~0.009 with env=1), and playback hard-steps the
  // speaker voltage from 0 to +0.97 in a single sample — audible as a
  // click in front of every hover blip. ~2 ms is well under the perceptual
  // threshold for attack timbre but plenty to smooth out the step.
  const attackSamples = Math.max(1, Math.floor(ctx.sampleRate * 0.002))
  // Triangle wave synthesis: phase accumulator + signed-folded ramp.
  let phase = 0
  for (let i = 0; i < samples; i++) {
    const t = i / samples
    const freq = 420 * Math.pow(640 / 420, Math.min(1, t / 0.5))
    phase += freq / ctx.sampleRate
    phase -= Math.floor(phase)
    // Triangle: 2 * |2 * (phase - 0.5)| - 1 in [-1, 1]
    const tri = 2 * Math.abs(2 * (phase - 0.5)) - 1
    const attack = i < attackSamples ? i / attackSamples : 1
    // Exponential decay from 1 → ~0.014 over 90ms, gated by the attack
    // ramp so the first ~2 ms slide cleanly out of silence.
    const env = attack * Math.exp(-t * 47.5)
    data[i] = tri * env
  }
  return buf
}

export function playMenuMove(): void {
  const ctx = getContext()
  if (!ctx) return
  if (!menuMoveBuffer) menuMoveBuffer = buildMenuMoveBuffer(ctx)

  // Cold-start guard — same logic as primeAudio's reasoning. Once steady-
  // state running, lead is 0.
  const lead = ctx.state === 'running' ? 0 : 0.008
  const start = ctx.currentTime + lead

  const src = ctx.createBufferSource()
  src.buffer = menuMoveBuffer
  const gain = ctx.createGain()
  // GainNode.gain defaults to 1.0 and holds that value until the first
  // scheduled event. If the source's first samples make it through the
  // graph before setValueAtTime(0.07, start) lands — which can happen
  // when `start ≈ ctx.currentTime` due to render-block alignment — those
  // samples pass at unity gain instead of 0.07 and the speaker hears a
  // transient. Anchoring the param to 0 immediately, then jumping to
  // the play level at `start`, prevents that.
  gain.gain.value = 0
  gain.gain.setValueAtTime(0.07 * getSfxVolume(), start)
  src.connect(gain).connect(ctx.destination)
  src.start(start)
}

/**
 * Two-note menu confirmation, split across press and release:
 *   - {@link playMenuSelectDown} plays the low G3 on press.
 *   - {@link playMenuSelectUp} plays the high C4 on confirmed release.
 * Both voices share the same warm triangle-through-lowpass character so the
 * pair still reads as a single rising fourth when chained together.
 */
function playMenuSelectNote(freq: number): void {
  const ctx = getContext()
  if (!ctx) return

  // Same cold-start guard as playMenuMove — keep the first press blip from
  // getting clipped while the audio graph spins up.
  const lead = ctx.state === 'running' ? 0 : 0.008
  const start = ctx.currentTime + lead
  const vol = getSfxVolume()

  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(700, start)
  filter.connect(ctx.destination)

  const osc = ctx.createOscillator()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, start)

  // Anchor gain to 0 immediately so the GainNode's default 1.0 can't briefly
  // pass the oscillator's first samples at unity (which produced a sharp
  // click in front of the up-blip when click→navigation timing made the
  // setValueAtTime land after the first render block). The 3 ms linear
  // attack into the play level keeps the sound's perceived character but
  // erases any residual step at note-on.
  const peak = 0.055 * vol
  const gain = ctx.createGain()
  gain.gain.value = 0
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.003)
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.14)

  osc.connect(gain)
  gain.connect(filter)
  osc.start(start)
  osc.stop(start + 0.15)
}

export function playMenuSelectDown(): void {
  playMenuSelectNote(196)
}

export function playMenuSelectUp(): void {
  playMenuSelectNote(262)
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

/** Short descending buzz when the player clicks something they can't afford. */
export function playCannotBuy(): void {
  const ctx = getContext()
  if (!ctx) return
  const now = ctx.currentTime
  const vol = getSfxVolume()

  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(220, now)
  osc.frequency.exponentialRampToValueAtTime(110, now + 0.12)

  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(0.07 * vol, now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.15)
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

// ---------------------------------------------------------------------------
// Asteroid shatter — per-type sound when an asteroid is destroyed
// ---------------------------------------------------------------------------

/**
 * Per-type asteroid shatter/destruction sound.
 * Soft types (comet, c-type) get a low crumble; hard types (m-type, v-type)
 * get a sharp metallic crack; d-type gets a wet organic split.
 */
export function playAsteroidShatter(type: AsteroidType): void {
  const ctx = getContext()
  if (!ctx) return
  const now = ctx.currentTime
  const vol = getSfxVolume()

  // Choose frequency and character based on type
  let baseFreq: number
  let filterType: BiquadFilterType
  let filterFreq: number
  let duration: number

  switch (type) {
    case 'v-type':
      baseFreq = 180
      filterType = 'bandpass'
      filterFreq = 2200
      duration = 0.4
      break
    case 'm-type':
      baseFreq = 140
      filterType = 'bandpass'
      filterFreq = 1600
      duration = 0.35
      break
    case 'd-type':
      baseFreq = 80
      filterType = 'lowpass'
      filterFreq = 600
      duration = 0.3
      break
    case 'comet':
      baseFreq = 40
      filterType = 'lowpass'
      filterFreq = 300
      duration = 0.25
      break
    default: // c-type, s-type
      baseFreq = 60
      filterType = 'lowpass'
      filterFreq = 500
      duration = 0.28
  }

  // Noise burst with bandpass for the crack/crumble character
  const bufferSize = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  const decay = type === 'v-type' || type === 'm-type' ? 0.06 : 0.04
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * decay))
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buffer

  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.setValueAtTime(filterFreq, now)
  filter.Q.setValueAtTime(1.5, now)

  const noiseGain = ctx.createGain()
  noiseGain.gain.setValueAtTime(0.12 * vol, now)
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  noise.connect(filter)
  filter.connect(noiseGain)
  noiseGain.connect(ctx.destination)
  noise.start(now)

  // Low tone for weight — metallic types get a pitched ring
  if (type === 'v-type' || type === 'm-type') {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(baseFreq, now)
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.3, now + duration * 0.8)

    const oscGain = ctx.createGain()
    oscGain.gain.setValueAtTime(0, now)
    oscGain.gain.linearRampToValueAtTime(0.06 * vol, now + 0.02)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    osc.connect(oscGain)
    oscGain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + duration + 0.01)
  }
}

/**
 * Tune the drill loop's bandpass filter to match the asteroid type being
 * drilled. Softer rocks (comet) get a low grind; harder rocks (v-type)
 * get a high-pitched screech.
 */
export function setDrillSoundType(type: AsteroidType): void {
  if (!drillSound || !audioCtx) return
  const now = audioCtx.currentTime
  let freq: number
  let q: number
  switch (type) {
    case 'v-type':
      freq = 1200; q = 3.5; break
    case 'm-type':
      freq = 900; q = 3; break
    case 'd-type':
      freq = 700; q = 2.5; break
    case 'comet':
      freq = 350; q = 1.5; break
    default: // c-type, s-type
      freq = 500; q = 2
  }
  drillSound.filter.frequency.setTargetAtTime(freq, now, 0.08)
  drillSound.filter.Q.setTargetAtTime(q, now, 0.08)
}

export function disposeSfx(): void {
  stopEngineSound()
  stopDrillSound()
  stopArbiterSiren()
  // Close our OWN context. sfx.ts holds a separate AudioContext from audio.ts
  // and music.ts (each module calls `new AudioContext()`), so nulling without
  // closing leaked one suspended context per scene teardown. After a handful of
  // quit-to-title → new-game cycles the browser's per-page AudioContext ceiling
  // (~6 in Chrome) is hit, `new AudioContext()` throws, getContext() returns
  // null, and every SFX silently dies for the rest of the session.
  if (audioCtx) {
    void audioCtx.close()
    audioCtx = null
  }
  // Re-prime on the next playthrough's fresh context (primeAudio is a no-op
  // while this stays true, which would reintroduce first-blip latency).
  primed = false
}
