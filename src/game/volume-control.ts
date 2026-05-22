/**
 * Central volume control — stores SFX and music volume levels.
 * Audio modules read these values when scaling gain.
 */

let sfxVolume = 0.65
let musicVolume = 0.22

/** Get the current SFX volume (0–1). */
export function getSfxVolume(): number {
  return sfxVolume
}

/** Get the current music volume (0–1). */
export function getMusicVolume(): number {
  return musicVolume
}

/** Set SFX volume (0–1). Clamped. */
export function setSfxVolume(vol: number): void {
  sfxVolume = Math.max(0, Math.min(1, vol))
}

/** Set music volume (0–1). Clamped. */
export function setMusicVolume(vol: number): void {
  musicVolume = Math.max(0, Math.min(1, vol))
}
