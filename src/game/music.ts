/**
 * Procedural background music system using Web Audio API.
 * Generates a layered ambient soundtrack that intensifies during combat.
 *
 * Layers:
 *   0 — Deep bass drone (always on)
 *   1 — Pad chords (fade in at intensity > 0.2)
 *   2 — Arpeggiated melody (fade in at intensity > 0.4)
 *   3 — Percussion pulse (fade in at intensity > 0.6)
 */

import { getMusicVolume } from './volume-control'

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let lowPassFilter: BiquadFilterNode | null = null
let layers: MusicLayer[] = []
let started = false
let currentIntensity = 0
let targetIntensity = 0
let isMuffled = false

/** How fast intensity lerps toward target (per second). */
const INTENSITY_LERP_SPEED = 1.5

interface MusicLayer {
  nodes: AudioNode[]
  gain: GainNode
  /** Intensity threshold at which this layer begins to fade in. */
  threshold: number
  /** Update callback for time-varying layers (arpeggio, percussion). */
  update?: (time: number, intensity: number) => void
}

function getContext(): AudioContext | null {
  if (ctx) return ctx
  try {
    ctx = new AudioContext()
  } catch {
    return null
  }
  return ctx
}

/** Toggle a muffled low-pass filter effect on the music. */
export function setMusicFilter(muffled: boolean): void {
  isMuffled = muffled
  if (!ctx || !lowPassFilter) return
  const freq = muffled ? 600 : 20000
  lowPassFilter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.1)
}

// --- Bass Drone Layer ---
function createBassDrone(ac: AudioContext, dest: AudioNode): MusicLayer {
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0, ac.currentTime)
  gain.connect(dest)

  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(32.7, ac.currentTime) // C1

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(80, ac.currentTime)
  filter.Q.setValueAtTime(2, ac.currentTime)

  osc.connect(filter)
  filter.connect(gain)
  osc.start()

  // Sub bass
  const sub = ac.createOscillator()
  sub.type = 'sine'
  sub.frequency.setValueAtTime(32.7, ac.currentTime)
  const subGain = ac.createGain()
  subGain.gain.setValueAtTime(0.3, ac.currentTime)
  sub.connect(subGain)
  subGain.connect(gain)
  sub.start()

  // Slow LFO wobble
  const lfo = ac.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(0.15, ac.currentTime)
  const lfoGain = ac.createGain()
  lfoGain.gain.setValueAtTime(3, ac.currentTime)
  lfo.connect(lfoGain)
  lfoGain.connect(osc.frequency)
  lfo.start()

  return { nodes: [osc, sub, lfo, filter, subGain, lfoGain], gain, threshold: 0 }
}

// --- Pad Chords Layer ---
function createPadChords(ac: AudioContext, dest: AudioNode): MusicLayer {
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0, ac.currentTime)
  gain.connect(dest)

  // Minor chord: C2, Eb2, G2
  const freqs = [65.41, 77.78, 98.0]
  const nodes: AudioNode[] = []

  for (const freq of freqs) {
    const osc = ac.createOscillator()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, ac.currentTime)

    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(200, ac.currentTime)

    const noteGain = ac.createGain()
    noteGain.gain.setValueAtTime(0.15, ac.currentTime)

    osc.connect(filter)
    filter.connect(noteGain)
    noteGain.connect(gain)
    osc.start()
    nodes.push(osc, filter, noteGain)
  }

  // Slow detune LFO for shimmer
  const lfo = ac.createOscillator()
  lfo.type = 'sine'
  lfo.frequency.setValueAtTime(0.3, ac.currentTime)
  const lfoGain = ac.createGain()
  lfoGain.gain.setValueAtTime(2, ac.currentTime)
  lfo.connect(lfoGain)
  // Modulate first oscillator's frequency for subtle movement
  const firstOsc = nodes[0] as OscillatorNode
  lfoGain.connect(firstOsc.frequency)
  lfo.start()
  nodes.push(lfo, lfoGain)

  return { nodes, gain, threshold: 0.2 }
}

// --- Arpeggio Layer ---
function createArpeggio(ac: AudioContext, dest: AudioNode): MusicLayer {
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0, ac.currentTime)
  gain.connect(dest)

  const osc = ac.createOscillator()
  osc.type = 'square'
  osc.frequency.setValueAtTime(130.81, ac.currentTime)

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(600, ac.currentTime)
  filter.Q.setValueAtTime(5, ac.currentTime)

  const noteGain = ac.createGain()
  noteGain.gain.setValueAtTime(0.08, ac.currentTime)

  osc.connect(filter)
  filter.connect(noteGain)
  noteGain.connect(gain)
  osc.start()

  // Arpeggio notes: Cm pentatonic
  const notes = [130.81, 155.56, 196.0, 261.63, 311.13, 392.0]
  let noteIndex = 0
  let elapsed = 0

  function update(time: number, intensity: number): void {
    // Speed up arpeggio with intensity: 4 notes/sec at 0.4, 8 notes/sec at 1.0
    const speed = 4 + intensity * 4
    const interval = 1 / speed
    elapsed += time

    if (elapsed >= interval) {
      elapsed -= interval
      noteIndex = (noteIndex + 1) % notes.length
      const freq = notes[noteIndex]
      osc.frequency.setTargetAtTime(freq, ac.currentTime, 0.02)

      // Filter opens more with intensity
      const filterFreq = 400 + intensity * 800
      filter.frequency.setTargetAtTime(filterFreq, ac.currentTime, 0.02)
    }
  }

  return { nodes: [osc, filter, noteGain], gain, threshold: 0.4, update }
}

// --- Percussion Layer ---
function createPercussion(ac: AudioContext, dest: AudioNode): MusicLayer {
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0, ac.currentTime)
  gain.connect(dest)

  // Use a filtered noise burst for kick-like percussion
  const bufferSize = ac.sampleRate * 0.1
  const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.02))
  }

  let source: AudioBufferSourceNode | null = null
  let elapsed = 0

  function update(time: number, intensity: number): void {
    // BPM scales with intensity: 120 at 0.6, 180 at 1.0
    const bpm = 120 + (intensity - 0.6) * 150
    const interval = 60 / bpm

    elapsed += time
    if (elapsed >= interval) {
      elapsed -= interval

      // Create new source for each hit
      if (source) {
        try {
          source.stop()
        } catch {
          // already stopped
        }
      }
      source = ac.createBufferSource()
      source.buffer = buffer
      const hitGain = ac.createGain()
      hitGain.gain.setValueAtTime(0.15, ac.currentTime)
      hitGain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08)
      source.connect(hitGain)
      hitGain.connect(gain)
      source.start()
    }
  }

  return { nodes: [], gain, threshold: 0.6, update }
}

/** Start background music. Idempotent. */
export function startMusic(): void {
  if (started) return
  const ac = getContext()
  if (!ac) return

  masterGain = ac.createGain()
  masterGain.gain.setValueAtTime(0, ac.currentTime)
  masterGain.gain.linearRampToValueAtTime(0.25, ac.currentTime + 2)

  lowPassFilter = ac.createBiquadFilter()
  lowPassFilter.type = 'lowpass'
  lowPassFilter.frequency.setValueAtTime(isMuffled ? 600 : 20000, ac.currentTime)

  masterGain.connect(lowPassFilter)
  lowPassFilter.connect(ac.destination)

  layers = [
    createBassDrone(ac, masterGain),
    createPadChords(ac, masterGain),
    createArpeggio(ac, masterGain),
    createPercussion(ac, masterGain),
  ]

  started = true
}

/** Set the target combat intensity (0 = peaceful, 1 = full combat). */
export function setMusicIntensity(intensity: number): void {
  targetIntensity = Math.max(0, Math.min(1, intensity))
}

/** Update music layers each frame. Call with frame delta time. */
export function updateMusic(dt: number): void {
  if (!started || !ctx) return

  // Apply music volume to master gain
  if (masterGain) {
    masterGain.gain.setTargetAtTime(0.25 * getMusicVolume(), ctx.currentTime, 0.1)
  }

  // Lerp intensity toward target
  const diff = targetIntensity - currentIntensity
  if (Math.abs(diff) > 0.001) {
    currentIntensity += Math.sign(diff) * Math.min(Math.abs(diff), INTENSITY_LERP_SPEED * dt)
  }

  // Update layer volumes based on intensity
  for (const layer of layers) {
    // Calculate target volume: 0 below threshold, ramp 0→1 over 0.2 range above threshold
    let vol = 0
    if (currentIntensity >= layer.threshold) {
      vol = Math.min(1, (currentIntensity - layer.threshold) / 0.2)
    }
    layer.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.1)

    // Update time-varying layers
    layer.update?.(dt, currentIntensity)
  }
}

/** Mute music (e.g. when paused). Keeps oscillators alive for resume. */
export function suspendMusic(): void {
  if (!started || !ctx || !masterGain) return
  masterGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05)
}

/** Unmute music after suspend. */
export function resumeMusic(): void {
  if (!started || !ctx || !masterGain) return
  masterGain.gain.setTargetAtTime(0.25 * getMusicVolume(), ctx.currentTime, 0.1)
}

/** Stop and clean up music. */
export function disposeMusic(): void {
  if (!started || !ctx) return

  for (const layer of layers) {
    for (const node of layer.nodes) {
      if (node instanceof OscillatorNode) {
        try {
          node.stop()
        } catch {
          // already stopped
        }
      }
    }
  }

  layers = []
  masterGain = null
  started = false
  currentIntensity = 0
  targetIntensity = 0

  // Intentionally keep `ctx` open and non-null: music.ts owns its own
  // AudioContext (separate from audio.ts / sfx.ts) and reuses it across scene
  // recreations — startMusic() rebuilds the layer graph on the same context, so
  // there's nothing to leak. It's freed when the page unloads.
}
