import * as THREE from 'three'

export interface DustMotes {
  points: THREE.Points
  update: (dt: number, camX: number, camY: number) => void
  dispose: () => void
}

export interface GalaxySpiral {
  points: THREE.Points
  update: (time: number, camX: number, camY: number) => void
  dispose: () => void
}

export function createDustMotes(): DustMotes {
  const COUNT = 80
  const positions = new Float32Array(COUNT * 3)
  const sizes = new Float32Array(COUNT)
  const alphas = new Float32Array(COUNT)

  const data: { baseX: number; baseY: number; speed: number; phase: number; size: number }[] = []

  for (let i = 0; i < COUNT; i++) {
    const i3 = i * 3
    const dx = (Math.random() - 0.5) * 800
    const dy = (Math.random() - 0.5) * 800
    positions[i3] = dx
    positions[i3 + 1] = dy
    positions[i3 + 2] = -8 + Math.random() * -4
    const s = 0.3 + Math.random() * 0.6
    sizes[i] = s
    alphas[i] = 0.1 + Math.random() * 0.2
    data.push({ baseX: dx, baseY: dy, speed: 0.2 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2, size: s })
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1))

  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) return { update: () => {}, dispose: () => {}, points: new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial()) }
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(200,220,255,0.6)')
  grad.addColorStop(1, 'rgba(200,220,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 32, 32)
  const texture = new THREE.CanvasTexture(canvas)

  const material = new THREE.PointsMaterial({
    size: 0.6,
    map: texture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    color: 0xaaccff,
  })

  const points = new THREE.Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = -2

  const posArr = positions
  const alphaArr = alphas

  function update(dt: number, camX: number, camY: number): void {
    points.position.x = camX * 0.08
    points.position.y = camY * 0.08

    for (let i = 0; i < COUNT; i++) {
      const d = data[i]
      d.phase += d.speed * dt
      const drift = Math.sin(d.phase) * 0.5
      const i3 = i * 3
      posArr[i3] = d.baseX + drift
      posArr[i3 + 1] = d.baseY + Math.cos(d.phase * 0.7) * 0.3
      alphaArr[i] = (0.08 + Math.sin(d.phase * 2) * 0.04) * (0.6 + Math.sin(d.phase + 1) * 0.4)
    }

    geometry.attributes.position.needsUpdate = true
    geometry.attributes.alpha.needsUpdate = true
  }

  function dispose(): void {
    geometry.dispose()
    material.dispose()
    texture.dispose()
  }

  return { points, update, dispose }
}

export function createGalaxySpiral(): GalaxySpiral {
  const COUNT = 1500
  const positions = new Float32Array(COUNT * 3)
  const colors = new Float32Array(COUNT * 3)

  for (let i = 0; i < COUNT; i++) {
    const arm = Math.floor(Math.random() * 3)
    const armAngle = (arm / 3) * Math.PI * 2
    const dist = 20 + Math.random() * 100
    const angle = armAngle + dist * 0.03 + (Math.random() - 0.5) * 0.4
    const scatter = (1 + Math.random() * 0.3) * (dist * 0.04)

    const i3 = i * 3
    positions[i3] = Math.cos(angle) * dist + (Math.random() - 0.5) * scatter
    positions[i3 + 1] = Math.sin(angle) * dist + (Math.random() - 0.5) * scatter
    positions[i3 + 2] = -30 + (Math.random() - 0.5) * 4

    const brightness = 0.3 + Math.random() * 0.4 + Math.max(0, 1 - dist / 100) * 0.3
    const tint = Math.random()
    colors[i3] = brightness * (1 - tint * 0.3)
    colors[i3 + 1] = brightness * (1 - tint * 0.5)
    colors[i3 + 2] = brightness
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const material = new THREE.PointsMaterial({
    size: 0.8,
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })

  const mesh = new THREE.Points(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = -3

  function update(time: number, camX: number, camY: number): void {
    mesh.position.x = camX * 0.05 + 100
    mesh.position.y = camY * 0.05 - 80
    mesh.rotation.z = time * 0.005
  }

  function dispose(): void {
    geometry.dispose()
    material.dispose()
  }

  return { points: mesh, update, dispose }
}
