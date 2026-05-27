import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

export interface BloomState {
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  vignettePass: ShaderPass
  chromaPass: ShaderPass
  targetStrength: number
  currentStrength: number
  setBloom: (strength: number, instant?: boolean) => void
  setVignette: (intensity: number) => void
  setChromaticAberration: (intensity: number) => void
  update: (dt: number) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.0 },
    darkness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      gl_FragColor = vec4(mix(texel.rgb, vec3(0.0), dot(uv, uv) * darkness), texel.a);
    }
  `,
}

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    intensity: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float intensity;
    varying vec2 vUv;
    void main() {
      vec2 offset = (vUv - 0.5) * intensity * 0.02;
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
}

export function createBloom(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): BloomState {
  const composer = new EffectComposer(renderer)
  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.3,
    0.5,
    0.1,
  )
  composer.addPass(bloomPass)

  const vignettePass = new ShaderPass(VignetteShader)
  vignettePass.uniforms.offset.value = 1.0
  vignettePass.uniforms.darkness.value = 0.0
  composer.addPass(vignettePass)

  const chromaPass = new ShaderPass(ChromaticAberrationShader)
  chromaPass.uniforms.intensity.value = 0.0
  composer.addPass(chromaPass)

  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  const state: BloomState = {
    composer,
    bloomPass,
    vignettePass,
    chromaPass,
    targetStrength: 0.3,
    currentStrength: 0.3,
    setBloom(strength: number, instant?: boolean) {
      state.targetStrength = strength
      if (instant) state.currentStrength = strength
    },
    setVignette(intensity: number) {
      vignettePass.uniforms.darkness.value = intensity
    },
    setChromaticAberration(intensity: number) {
      chromaPass.uniforms.intensity.value = intensity
    },
    update(dt: number) {
      const diff = state.targetStrength - state.currentStrength
      state.currentStrength += diff * Math.min(1, dt * 6)
      bloomPass.strength = state.currentStrength
    },
    resize(w: number, h: number) {
      composer.setSize(w, h)
      bloomPass.resolution.set(w, h)
    },
    dispose() {
      composer.dispose()
    },
  }

  return state
}
