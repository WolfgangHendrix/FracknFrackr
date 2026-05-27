import * as THREE from 'three'

let _texture: THREE.CanvasTexture | null = null
function getSoftCircleTexture(): THREE.CanvasTexture {
  if (_texture) return _texture
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)
  _texture = new THREE.CanvasTexture(canvas)
  return _texture
}

export interface ParticleSystemConfig {
  maxParticles: number
}

export interface ParticleSystem {
  points: THREE.Points
  update: (dt: number) => void
  emit: (x: number, y: number, count: number, config?: {
    lifetime?: number
    speed?: number
    size?: number
    color?: THREE.Color | string | number
    colors?: (THREE.Color | string | number)[]
    spread?: number
    gravity?: number
    zRange?: number
    inheritVelocity?: { vx: number; vy: number }
  }) => void
  dispose: () => void
}

export function createParticleSystem(config: ParticleSystemConfig): ParticleSystem {
  const max = config.maxParticles
  const positions = new Float32Array(max * 3)
  const sizes = new Float32Array(max)
  const colors = new Float32Array(max * 3)
  const alphas = new Float32Array(max)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))

  const material = new THREE.PointsMaterial({
    size: 1,
    map: getSoftCircleTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 1,
    vertexColors: true,
    sizeAttenuation: true,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false

  const posArr = positions
  const sizeArr = sizes
  const colorArr = colors
  const alphaArr = alphas

  interface InternalParticle {
    x: number; y: number; z: number
    vx: number; vy: number; vz: number
    life: number; maxLife: number
    size: number; startSize: number
    r: number; g: number; b: number
    alpha: number; active: boolean
    fadeOut: boolean; shrink: boolean; gravity: number
  }

  const pool: InternalParticle[] = []
  for (let i = 0; i < max; i++) {
    pool.push({
      x: 0, y: 0, z: 0,
      vx: 0, vy: 0, vz: 0,
      life: 0, maxLife: 1,
      size: 1, startSize: 1,
      r: 1, g: 1, b: 1,
      alpha: 1, active: false,
      fadeOut: true, shrink: true, gravity: 0,
    })
  }

  const tempColor = new THREE.Color()

  function findInactive(count: number): InternalParticle[] {
    const found: InternalParticle[] = []
    for (const p of pool) {
      if (!p.active) { found.push(p); if (found.length >= count) break }
    }
    return found
  }

  function emit(
    x: number, y: number, count: number,
    cfg: {
      lifetime?: number; speed?: number; size?: number
      color?: THREE.Color | string | number
      colors?: (THREE.Color | string | number)[]
      spread?: number; gravity?: number; zRange?: number
      inheritVelocity?: { vx: number; vy: number }
    } = {},
  ): void {
    const lifetime = cfg.lifetime ?? 0.5
    const speed = cfg.speed ?? 30
    const size = cfg.size ?? 1.5
    const spread = cfg.spread ?? Math.PI * 2
    const gravity = cfg.gravity ?? 0
    const zRange = cfg.zRange ?? 0.5
    const iv = cfg.inheritVelocity
    const colorSources = cfg.colors ?? (cfg.color ? [cfg.color] : [0xffffff])

    for (const p of findInactive(count)) {
      p.active = true
      p.x = x; p.y = y; p.z = (Math.random() - 0.5) * zRange
      const angle = Math.random() * spread
      const spd = speed * (0.5 + Math.random() * 0.5)
      p.vx = Math.cos(angle) * spd + (iv ? iv.vx * 0.3 : 0)
      p.vy = Math.sin(angle) * spd + (iv ? iv.vy * 0.3 : 0)
      p.vz = (Math.random() - 0.5) * speed * 0.2
      p.life = 0
      p.maxLife = lifetime * (0.7 + Math.random() * 0.3)
      p.startSize = size * (0.6 + Math.random() * 0.4)
      p.size = p.startSize
      p.fadeOut = true
      p.shrink = true
      p.gravity = gravity

      const src = colorSources[Math.floor(Math.random() * colorSources.length)]
      tempColor.set(src)
      p.r = tempColor.r; p.g = tempColor.g; p.b = tempColor.b
      p.alpha = 1
    }
  }

  function update(dt: number): void {
    let wi = 0
    for (const p of pool) {
      if (!p.active) {
        alphaArr[wi] = 0
        sizeArr[wi] = 0
        wi++
        continue
      }

      p.life += dt
      if (p.life >= p.maxLife) {
        p.active = false
        alphaArr[wi] = 0
        sizeArr[wi] = 0
        wi++
        continue
      }

      const t = p.life / p.maxLife
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      if (p.gravity) p.vy -= p.gravity * dt

      if (p.fadeOut) p.alpha = Math.max(0, 1 - t * t)
      if (p.shrink) p.size = p.startSize * (1 - t * 0.8)
      p.size = Math.max(0.01, p.size)

      const i3 = wi * 3
      posArr[i3] = p.x
      posArr[i3 + 1] = p.y
      posArr[i3 + 2] = p.z
      sizeArr[wi] = p.size
      colorArr[i3] = p.r * p.alpha
      colorArr[i3 + 1] = p.g * p.alpha
      colorArr[i3 + 2] = p.b * p.alpha
      alphaArr[wi] = p.alpha
      wi++
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.size.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
    geometry.attributes.alpha.needsUpdate = true
  }

  function dispose(): void {
    geometry.dispose()
    material.dispose()
  }

  return { points, update, emit, dispose }
}
