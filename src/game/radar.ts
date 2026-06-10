/**
 * Mini-map radar — a ship-centred, north-up overlay in the lower-left corner.
 *
 * Drawn on its own 2D canvas (independent of the Three.js renderer) so it can
 * sit cheaply on top of the scene. Shows the trade station, asteroids and
 * hostile ships relative to the player; targets beyond radar range are pinned
 * to the rim so they stay locatable.
 */

/** On-screen size of the (square) radar canvas at sensor tier 0, in CSS pixels. */
const RADAR_CSS_SIZE = 134

/** World-space distance from the player mapped to the radar rim at tier 0. */
const RADAR_RANGE = 540

/** Inset of the rim from the canvas edge, in CSS pixels. */
const RIM_MARGIN = 5

/**
 * Sensor Array — per-tier multipliers.
 *
 * `RANGE_GAIN` extends how far the radar reads; `SIZE_GAIN` grows the canvas
 * itself so the extra world isn't just smushed into the same pixel budget.
 * The size growth is roughly 60% of the range growth, so each tier gains
 * meaningful reach AND meaningful clarity — without ballooning the overlay
 * to dominate the corner. Tier 0→3 ends at +75% range, +45% canvas, ~83%
 * of the original blip density (was ~57% before the canvas grew).
 */
const SENSOR_RANGE_GAIN = 0.25
const SENSOR_SIZE_GAIN = 0.15

/** Compute the radar's CSS size for a given sensor tier. */
function radarSizeForTier(tier: number): number {
  return RADAR_CSS_SIZE * (1 + SENSOR_SIZE_GAIN * tier)
}

/** Compute the radar's world-space scanning range for a given sensor tier. */
function radarRangeForTier(tier: number): number {
  return RADAR_RANGE * (1 + SENSOR_RANGE_GAIN * tier)
}

export interface RadarBlip {
  x: number
  y: number
}

export interface DroneBlip extends RadarBlip {
  /** Drone state — picks the dot color so the player can see what's happening. */
  state: 'seeking' | 'drilling' | 'returning' | 'retreating'
}

export interface RadarData {
  shipX: number
  shipY: number
  /** Ship heading (radians); model faces local +Y. */
  shipRotation: number
  asteroids: RadarBlip[]
  /** Roaming comets — rare fast crossers, drawn as bright cyan contacts. */
  comets: RadarBlip[]
  enemies: RadarBlip[]
  blackHoles: RadarBlip[]
  drones: DroneBlip[]
  station: RadarBlip | null
  arbiter: RadarBlip | null
  /** Active rally point in world coords, or null if drones are unguided. */
  rally: RadarBlip | null
  /** Sensor Array upgrade tier (0-3). Each tier extends the scanning range. */
  sensorTier: number
  /** Gamepad D-pad crosshair position (normalized -1..1), null = hidden. */
  gamepadCrosshair?: { nx: number; ny: number } | null
}

export interface Radar {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  /** Public CSS size of the canvas — exposed so callers can map clicks back to world coords. */
  size: number
  /** World-space distance from the player mapped to the radar rim. */
  range: number
  /** Device-pixel ratio captured at creation, re-applied on every resize. */
  dpr: number
  /** Last sensor tier the canvas was sized for — used to skip no-op resizes. */
  sizedForTier: number
}

/** Create the radar canvas and attach it to the game container. */
export function createRadar(container: HTMLElement): Radar | null {
  const canvas = document.createElement('canvas')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = RADAR_CSS_SIZE * dpr
  canvas.height = RADAR_CSS_SIZE * dpr
  canvas.style.position = 'absolute'
  canvas.style.left = '14px'
  canvas.style.bottom = '14px'
  canvas.style.width = `${RADAR_CSS_SIZE}px`
  canvas.style.height = `${RADAR_CSS_SIZE}px`
  // Pointer events enabled so the player can click/tap to set a rally point.
  canvas.style.pointerEvents = 'auto'
  canvas.style.cursor = 'crosshair'
  canvas.style.zIndex = '30'

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(dpr, dpr)

  container.appendChild(canvas)
  return {
    canvas,
    ctx,
    size: RADAR_CSS_SIZE,
    range: RADAR_RANGE,
    dpr,
    sizedForTier: 0,
  }
}

/**
 * Resize the radar canvas in place to match a new sensor tier.
 *
 * Touching `canvas.width`/`canvas.height` resets the context transform, so we
 * re-apply the DPR scale afterwards. The CSS bottom anchor (`bottom: 14px`)
 * keeps the radar pinned to the lower-left corner — the canvas grows upward
 * and rightward as the upgrade ticks up.
 */
function resizeRadar(radar: Radar, sensorTier: number): void {
  if (radar.sizedForTier === sensorTier) return
  const cssSize = radarSizeForTier(sensorTier)
  radar.canvas.width = cssSize * radar.dpr
  radar.canvas.height = cssSize * radar.dpr
  radar.canvas.style.width = `${cssSize}px`
  radar.canvas.style.height = `${cssSize}px`
  radar.ctx.setTransform(1, 0, 0, 1, 0, 0)
  radar.ctx.scale(radar.dpr, radar.dpr)
  radar.size = cssSize
  radar.range = radarRangeForTier(sensorTier)
  radar.sizedForTier = sensorTier
}

/**
 * Convert a click on the radar canvas to a world-space coordinate centered
 * on the ship. Returns null if the click was outside the radar's circular
 * face (so we don't accidentally rally to a corner of the canvas square).
 */
export function radarClickToWorld(
  radar: Radar,
  clientX: number,
  clientY: number,
  shipX: number,
  shipY: number,
): { x: number; y: number } | null {
  const rect = radar.canvas.getBoundingClientRect()
  const lx = clientX - rect.left
  const ly = clientY - rect.top
  const cx = radar.size / 2
  const cy = radar.size / 2
  const rim = radar.size / 2 - RIM_MARGIN
  const dx = lx - cx
  const dy = ly - cy
  if (dx * dx + dy * dy > rim * rim) return null
  const scale = rim / radar.range
  // Canvas Y points down but world Y points up — invert.
  return { x: shipX + dx / scale, y: shipY - dy / scale }
}

/**
 * Convert a normalized radar crosshair position to a world-space coordinate.
 * nx, ny are normalized coords in range [-1, 1], where (0, 0) is the ship center.
 */
export function radarCrosshairToWorld(
  radar: Radar,
  nx: number,
  ny: number,
  shipX: number,
  shipY: number,
): { x: number; y: number } {
  // Scale normalized coords by the radar range (already accounts for rim).
  return { x: shipX + nx * radar.range, y: shipY - ny * radar.range }
}

/** Redraw the radar for the current frame. */
export function updateRadar(radar: Radar, data: RadarData): void {
  // Re-size the canvas to match the current sensor tier before drawing. The
  // resize is a no-op when the tier hasn't changed, so this is free per frame
  // and only pays the cost at the moment the player buys the upgrade.
  resizeRadar(radar, data.sensorTier)

  const { ctx } = radar
  const size = radar.size
  const cx = size / 2
  const cy = size / 2
  const rim = size / 2 - RIM_MARGIN
  const range = radar.range
  const scale = rim / range

  ctx.clearRect(0, 0, size, size)

  // --- Backdrop disc ---
  ctx.beginPath()
  ctx.arc(cx, cy, rim, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(6, 20, 14, 0.78)'
  ctx.fill()

  // --- Range rings + crosshair ---
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.18)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, rim * 0.5, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - rim, cy)
  ctx.lineTo(cx + rim, cy)
  ctx.moveTo(cx, cy - rim)
  ctx.lineTo(cx, cy + rim)
  ctx.stroke()

  // Everything inside the disc is clipped so blips never spill past the rim.
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, rim, 0, Math.PI * 2)
  ctx.clip()

  // Map a world point to radar canvas coords. `dist` is its world distance
  // from the ship; out-of-range points are pinned to the rim.
  const project = (
    wx: number,
    wy: number,
  ): { px: number; py: number; dist: number; clamped: boolean } => {
    const dx = wx - data.shipX
    const dy = wy - data.shipY
    const dist = Math.hypot(dx, dy)
    if (dist <= range || dist < 0.001) {
      return { px: cx + dx * scale, py: cy - dy * scale, dist, clamped: false }
    }
    const ux = dx / dist
    const uy = dy / dist
    return { px: cx + ux * rim, py: cy - uy * rim, dist, clamped: true }
  }

  // --- Asteroids (only those within range) ---
  ctx.fillStyle = 'rgba(176, 152, 120, 0.85)'
  for (const a of data.asteroids) {
    const dx = a.x - data.shipX
    const dy = a.y - data.shipY
    if (dx * dx + dy * dy > range * range) continue
    ctx.beginPath()
    ctx.arc(cx + dx * scale, cy - dy * scale, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Roaming comets — bright cyan contacts (pinned to rim when inbound) ---
  for (const c of data.comets) {
    const { px, py, clamped } = project(c.x, c.y)
    if (clamped && data.sensorTier < 3) continue
    ctx.fillStyle = clamped ? 'rgba(102, 255, 204, 0.5)' : 'rgba(120, 255, 220, 0.95)'
    ctx.beginPath()
    ctx.arc(px, py, clamped ? 2 : 2.8, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Trade station — green diamond (pinned to rim when out of range) ---
  if (data.station) {
    const { px, py } = project(data.station.x, data.station.y)
    drawDiamond(ctx, px, py, 4.5, '#00ff88')
  }

  // --- Black holes — persistent hazard markers, pinned at every tier ---
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 180)
  for (const h of data.blackHoles) {
    const { px, py, clamped } = project(h.x, h.y)
    const r = clamped ? 4.2 : 5.5
    ctx.strokeStyle = `rgba(255, 82, 48, ${(0.65 + pulse * 0.3).toFixed(3)})`
    ctx.lineWidth = clamped ? 1.3 : 1.6
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = clamped ? 'rgba(20, 0, 8, 0.9)' : 'rgba(0, 0, 0, 0.95)'
    ctx.beginPath()
    ctx.arc(px, py, clamped ? 2 : 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 168, 64, 0.75)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(px - r - 2, py)
    ctx.lineTo(px - r + 1, py)
    ctx.moveTo(px + r - 1, py)
    ctx.lineTo(px + r + 2, py)
    ctx.moveTo(px, py - r - 2)
    ctx.lineTo(px, py - r + 1)
    ctx.moveTo(px, py + r - 1)
    ctx.lineTo(px, py + r + 2)
    ctx.stroke()
  }

  // --- Enemy ships — pulsing red dots ---
  // Tier 0-2: only paint contacts within scan range.
  // Tier 3: also paint out-of-range contacts clamped to the rim (dimmer, smaller).
  for (const e of data.enemies) {
    const { px, py, clamped } = project(e.x, e.y)
    if (clamped && data.sensorTier < 3) continue
    ctx.fillStyle = clamped
      ? `rgba(255, 60, 60, ${(pulse * 0.45).toFixed(3)})`
      : `rgba(255, 60, 60, ${pulse.toFixed(3)})`
    ctx.beginPath()
    ctx.arc(px, py, clamped ? 1.8 : 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Rally point — soft amber crosshair so the player can see the order ---
  if (data.rally) {
    const { px, py } = project(data.rally.x, data.rally.y)
    const r = 6
    ctx.strokeStyle = 'rgba(255, 216, 102, 0.85)'
    ctx.lineWidth = 1.25
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(px - r - 2, py)
    ctx.lineTo(px - r + 2, py)
    ctx.moveTo(px + r - 2, py)
    ctx.lineTo(px + r + 2, py)
    ctx.moveTo(px, py - r - 2)
    ctx.lineTo(px, py - r + 2)
    ctx.moveTo(px, py + r - 2)
    ctx.lineTo(px, py + r + 2)
    ctx.stroke()
  }

  // --- Gamepad radar crosshair (D-pad control) — hollow circle to distinguish from rally point ---
  if (data.gamepadCrosshair) {
    const { nx, ny } = data.gamepadCrosshair
    const px = cx + nx * rim
    const py = cy - ny * rim
    const r = 5.5
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(px, py, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(px - 3, py)
    ctx.lineTo(px + 3, py)
    ctx.moveTo(px, py - 3)
    ctx.lineTo(px, py + 3)
    ctx.stroke()
  }

  // --- Mining drones — color-coded by state ---
  const DRONE_RADAR_COLOR: Record<DroneBlip['state'], string> = {
    seeking: '#88ccff',
    drilling: '#ff8833',
    returning: '#77ffcc',
    retreating: '#ff4466',
  }
  for (const d of data.drones) {
    const { px, py } = project(d.x, d.y)
    ctx.fillStyle = DRONE_RADAR_COLOR[d.state]
    ctx.beginPath()
    ctx.arc(px, py, 2.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Arbiter — large hostile marker ---
  if (data.arbiter) {
    const { px, py } = project(data.arbiter.x, data.arbiter.y)
    ctx.fillStyle = `rgba(255, 40, 90, ${(0.5 + 0.5 * pulse).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(px, py, 5.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ff8899'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.arc(px, py, 8, 0, Math.PI * 2)
    ctx.stroke()
  }

  // --- Player — triangle at centre pointing along the ship heading ---
  // Model faces local +Y, so heading θ maps to world (-sinθ, cosθ). On the
  // radar the Y axis is flipped, giving the screen direction below.
  const dirX = -Math.sin(data.shipRotation)
  const dirY = -Math.cos(data.shipRotation)
  const perpX = -dirY
  const perpY = dirX
  ctx.fillStyle = '#39c6ff'
  ctx.beginPath()
  ctx.moveTo(cx + dirX * 7, cy + dirY * 7)
  ctx.lineTo(cx - dirX * 4 + perpX * 4, cy - dirY * 4 + perpY * 4)
  ctx.lineTo(cx - dirX * 4 - perpX * 4, cy - dirY * 4 - perpY * 4)
  ctx.closePath()
  ctx.fill()

  ctx.restore()

  // --- Rim ---
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(cx, cy, rim, 0, Math.PI * 2)
  ctx.stroke()
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.lineTo(x + r, y)
  ctx.lineTo(x, y + r)
  ctx.lineTo(x - r, y)
  ctx.closePath()
  ctx.fill()
}

/** Remove the radar canvas from the DOM. */
export function disposeRadar(radar: Radar): void {
  radar.canvas.parentElement?.removeChild(radar.canvas)
}
