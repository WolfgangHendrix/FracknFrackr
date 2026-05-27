import { createParticleSystem } from './particle-system'
import type { ParticleSystem } from './particle-system'

export interface ShipDamageVfx {
  sparkSystem: ParticleSystem
  hitFlash: () => void
  update: (dt: number) => void
  dispose: () => void
}

export function createShipDamageVfx(): ShipDamageVfx {
  const sparkSystem = createParticleSystem({ maxParticles: 60 })
  let flashTimer = 0

  function hitFlash(): void {
    flashTimer = 0.15
  }

  function update(dt: number): void {
    if (flashTimer > 0) {
      flashTimer -= dt
    }
    sparkSystem.update(dt)
  }

  function dispose(): void {
    sparkSystem.dispose()
  }

  return { sparkSystem, hitFlash, update, dispose }
}
