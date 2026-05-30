import * as THREE from 'three'

/**
 * Retro render path — chunky pixel "Atari-era" cosmetic mode.
 *
 * Renders the 3D scene to a tiny offscreen target, then upsamples it to the
 * canvas with NEAREST filtering so geometry edges become hard, blocky
 * pixels. Skips the bloom / vignette / chromatic-aberration composer
 * entirely — the smooth glow fights the aesthetic.
 *
 * Purely cosmetic: the simulation, hitboxes, and HUD are unaffected. Only
 * the scene's render-time appearance changes.
 */

/** Internal target width — scaled to match aspect on resize. */
const BASE_INTERNAL_WIDTH = 320

export interface RetroRenderer {
  render: (scene: THREE.Scene, camera: THREE.Camera) => void
  resize: (canvasWidth: number, canvasHeight: number) => void
  dispose: () => void
}

/**
 * Create the retro renderer. The fullscreen quad is built once and reused
 * across frames — only the render target's contents and the quad's screen
 * resolution change at runtime.
 */
export function createRetroRenderer(renderer: THREE.WebGLRenderer): RetroRenderer {
  // Internal low-res target. NEAREST filtering on both min and mag is what
  // gives the chunky-pixel look when we sample it into the fullscreen quad.
  const target = new THREE.WebGLRenderTarget(BASE_INTERNAL_WIDTH, Math.round(BASE_INTERNAL_WIDTH * 0.5625), {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    depthBuffer: true,
    stencilBuffer: false,
  })

  // Fullscreen ortho scene that draws a single textured quad covering the
  // viewport. The quad samples `target.texture` with NEAREST so each retro
  // pixel becomes a solid block on the canvas.
  const quadScene = new THREE.Scene()
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const quadMaterial = new THREE.MeshBasicMaterial({
    map: target.texture,
    depthTest: false,
    depthWrite: false,
  })
  const quadGeo = new THREE.PlaneGeometry(2, 2)
  const quadMesh = new THREE.Mesh(quadGeo, quadMaterial)
  quadScene.add(quadMesh)

  let canvasW = 1
  let canvasH = 1

  function resize(w: number, h: number): void {
    canvasW = w
    canvasH = h
    // Hold internal width at BASE_INTERNAL_WIDTH; derive height from the
    // canvas aspect so retro pixels stay square regardless of window shape.
    const aspect = w / Math.max(1, h)
    const internalW = BASE_INTERNAL_WIDTH
    const internalH = Math.max(1, Math.round(BASE_INTERNAL_WIDTH / aspect))
    target.setSize(internalW, internalH)
  }

  function render(scene: THREE.Scene, camera: THREE.Camera): void {
    // Pass 1: scene → low-res target.
    const prevTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(target)
    renderer.clear()
    renderer.render(scene, camera)
    renderer.setRenderTarget(prevTarget)

    // Pass 2: low-res target → canvas via the fullscreen quad, NEAREST
    // filter sampled so the texels become hard pixels at canvas resolution.
    renderer.setViewport(0, 0, canvasW, canvasH)
    renderer.render(quadScene, quadCamera)
  }

  function dispose(): void {
    target.dispose()
    quadGeo.dispose()
    quadMaterial.dispose()
  }

  // Initial sizing from current renderer drawing buffer so the first frame
  // after enable is well-formed even before a window resize fires.
  const size = renderer.getSize(new THREE.Vector2())
  resize(size.x, size.y)

  return { render, resize, dispose }
}
