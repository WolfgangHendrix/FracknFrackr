import * as THREE from 'three'

export interface DynamicLights {
  engineLight: THREE.PointLight
  explosionLights: { light: THREE.PointLight; timer: number }[]
  shipLight: THREE.PointLight
  update: (dt: number, shipX: number, shipY: number, speed: number) => void
  flashExplosion: (x: number, y: number, intensity?: number) => void
  dispose: () => void
}

export function createDynamicLights(): DynamicLights {
  const engineLight = new THREE.PointLight(0xff6600, 0, 60)
  engineLight.position.z = 2
  engineLight.decay = 2

  const shipLight = new THREE.PointLight(0x88ccff, 0.3, 80)
  shipLight.position.z = 5
  shipLight.decay = 2

  const explosionLights: { light: THREE.PointLight; timer: number }[] = []
  for (let i = 0; i < 8; i++) {
    const light = new THREE.PointLight(0xff8800, 0, 50)
    light.decay = 2
    explosionLights.push({ light, timer: 0 })
  }

  function update(dt: number, shipX: number, shipY: number, speed: number): void {
    engineLight.position.set(shipX, shipY - 4, 2)
    engineLight.intensity = speed * 3

    shipLight.position.set(shipX, shipY, 5)
    shipLight.intensity = 0.3 + speed * 0.3

    for (const el of explosionLights) {
      if (el.timer > 0) {
        el.timer -= dt
        el.light.intensity = Math.max(0, el.timer * 6)
      }
    }
  }

  function flashExplosion(x: number, y: number, intensity: number = 1): void {
    for (const el of explosionLights) {
      if (el.timer <= 0) {
        el.light.position.set(x, y, 3)
        el.timer = 0.3 * intensity
        el.light.intensity = intensity * 8
        return
      }
    }
  }

  function dispose(): void {
    engineLight.dispose()
    shipLight.dispose()
    for (const el of explosionLights) {
      el.light.dispose()
    }
  }

  return { engineLight, explosionLights, shipLight, update, flashExplosion, dispose }
}
