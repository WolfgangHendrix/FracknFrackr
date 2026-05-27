import { createParticleSystem } from './particle-system'
import type { ParticleSystem } from './particle-system'

export interface ProjectileTrails {
  system: ParticleSystem
  addTrail: (x: number, y: number, vx: number, vy: number) => void
  update: (dt: number) => void
  dispose: () => void
}

export function createProjectileTrails(): ProjectileTrails {
  const system = createParticleSystem({ maxParticles: 200 })

  function addTrail(x: number, y: number, vx: number, vy: number): void {
    system.emit(x, y, 1, {
      lifetime: 0.25,
      speed: 2,
      size: 0.8,
      color: 0x88ccff,
      zRange: 0.1,
      inheritVelocity: { vx, vy },
    })
  }

  function update(dt: number): void {
    system.update(dt)
  }

  function dispose(): void {
    system.dispose()
  }

  return { system, addTrail, update, dispose }
}
