/**
 * Mini-map radar — a ship-centred, north-up overlay in the lower-left corner.
 *
 * Drawn on its own 2D canvas (independent of the Three.js renderer) so it can
 * sit cheaply on top of the scene. Shows the trade station, asteroids and
 * hostile ships relative to the player; targets beyond radar range are pinned
 * to the rim so they stay locatable.
 */

/** On-screen size of the (square) radar canvas, in CSS pixels. */
const RADAR_CSS_SIZE = 134

/** World-space distance from the player mapped to the radar rim. */
const RADAR_RANGE = 540

/** Inset of the rim from the canvas edge, in CSS pixels. */
const RIM_MARGIN = 5

export interface RadarBlip {
  x: number
  y: number
}

export interface RadarData {
  shipX: number
  shipY: number
  /** Ship heading (radians); model faces local +Y. */
  shipRotation: number
  asteroids: RadarBlip[]
  enemies: RadarBlip[]
  station: RadarBlip | null
  arbiter: RadarBlip | null
}

export interface Radar {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
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
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '30'

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.scale(dpr, dpr)

  container.appendChild(canvas)
  return { canvas, ctx }
}

/** Redraw the radar for the current frame. */
export function updateRadar(radar: Radar, data: RadarData): void {
  const { ctx } = radar
  const size = RADAR_CSS_SIZE
  const cx = size / 2
  const cy = size / 2
  const rim = size / 2 - RIM_MARGIN
  const scale = rim / RADAR_RANGE

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
    if (dist <= RADAR_RANGE || dist < 0.001) {
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
    if (dx * dx + dy * dy > RADAR_RANGE * RADAR_RANGE) continue
    ctx.beginPath()
    ctx.arc(cx + dx * scale, cy - dy * scale, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Trade station — green diamond (pinned to rim when out of range) ---
  if (data.station) {
    const { px, py } = project(data.station.x, data.station.y)
    drawDiamond(ctx, px, py, 4.5, '#00ff88')
  }

  // --- Enemy ships — pulsing red dots ---
  const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 180)
  ctx.fillStyle = `rgba(255, 60, 60, ${pulse.toFixed(3)})`
  for (const e of data.enemies) {
    const { px, py } = project(e.x, e.y)
    ctx.beginPath()
    ctx.arc(px, py, 3, 0, Math.PI * 2)
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
