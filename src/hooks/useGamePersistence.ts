'use client'

import { useCallback } from 'react'
import {
  defaultProfile,
  GameStateSchema,
  ProfileSchema,
  SAVE_SLOT_IDS,
} from '@/lib/schemas'
import type { AchievementMetrics, ProfileId, ProfileSave } from '@/lib/schemas'

const PROFILE_KEY_PREFIX = 'fracking-asteroids-profile:'
const LEGACY_SAVE_KEY_PREFIX = 'fracking-asteroids-save:'
const ACTIVE_PROFILE_KEY = 'fracking-asteroids-active-profile'
const LEGACY_ACTIVE_SLOT_KEY = 'fracking-asteroids-active-slot'

export function isProfileId(value: string | null): value is ProfileId {
  return SAVE_SLOT_IDS.includes(value as ProfileId)
}

export function getActiveProfile(): ProfileId | null {
  if (typeof window === 'undefined') return null
  const current = localStorage.getItem(ACTIVE_PROFILE_KEY)
  if (isProfileId(current)) return current
  const legacy = localStorage.getItem(LEGACY_ACTIVE_SLOT_KEY)
  return isProfileId(legacy) ? legacy : null
}

export function setActiveProfile(profileId: ProfileId): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId)
  localStorage.setItem(LEGACY_ACTIVE_SLOT_KEY, profileId)
}

export function clearActiveProfile(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACTIVE_PROFILE_KEY)
  localStorage.removeItem(LEGACY_ACTIVE_SLOT_KEY)
}

function profileKey(profileId: ProfileId): string {
  return `${PROFILE_KEY_PREFIX}${profileId}`
}

function legacySaveKey(profileId: ProfileId): string {
  return `${LEGACY_SAVE_KEY_PREFIX}${profileId}`
}

function profileFromLegacy(profileId: ProfileId, raw: string): ProfileSave | null {
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = GameStateSchema.safeParse(parsed)
    if (!result.success) return null
    const state = result.data
    const createdAt = state.timestamp || Date.now()
    return {
      ...defaultProfile(profileId, createdAt),
      updatedAt: state.timestamp || createdAt,
      highScore: state.highScore,
      achievements: state.achievements,
      metrics: state.metrics,
    }
  } catch {
    return null
  }
}

export function loadProfile(profileId: ProfileId): ProfileSave | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(profileKey(profileId))
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      const result = ProfileSchema.safeParse(parsed)
      if (result.success) return result.data
    }

    const legacyRaw = localStorage.getItem(legacySaveKey(profileId))
    if (!legacyRaw) return null
    const migrated = profileFromLegacy(profileId, legacyRaw)
    if (!migrated) return null
    saveProfile(migrated)
    return migrated
  } catch {
    return null
  }
}

export function loadProfiles(): Map<ProfileId, ProfileSave> {
  const map = new Map<ProfileId, ProfileSave>()
  for (const profileId of SAVE_SLOT_IDS) {
    const profile = loadProfile(profileId)
    if (profile) map.set(profileId, profile)
  }
  return map
}

export function saveProfile(profile: ProfileSave): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(profileKey(profile.profileId), JSON.stringify(profile))
  } catch {
    // ignore quota errors silently
  }
}

export function createProfile(profileId: ProfileId): ProfileSave {
  const existing = loadProfile(profileId)
  if (existing) return existing
  const profile = defaultProfile(profileId)
  saveProfile(profile)
  return profile
}

export function deleteProfile(profileId: ProfileId): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(profileKey(profileId))
  localStorage.removeItem(legacySaveKey(profileId))
}

export function updateProfileProgress(
  profileId: ProfileId,
  progress: {
    highScore: number
    achievements: string[]
    metrics: AchievementMetrics
  },
): ProfileSave {
  const previous = loadProfile(profileId) ?? defaultProfile(profileId)
  const profile: ProfileSave = {
    ...previous,
    updatedAt: Date.now(),
    highScore: Math.max(previous.highScore, progress.highScore),
    achievements: progress.achievements,
    metrics: progress.metrics,
  }
  saveProfile(profile)
  return profile
}

export function useGamePersistence(profileId: ProfileId | null) {
  const save = useCallback(
    async (progress: { highScore: number; achievements: string[]; metrics: AchievementMetrics }) => {
      if (!profileId) return null
      return updateProfileProgress(profileId, progress)
    },
    [profileId],
  )

  const load = useCallback(async (): Promise<ProfileSave | null> => {
    if (!profileId) return null
    return loadProfile(profileId)
  }, [profileId])

  return { save, load }
}
