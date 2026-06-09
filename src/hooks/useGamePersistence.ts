'use client'

import { useCallback } from 'react'
import { ProfileSchema, ProfileSummarySchema } from '@/lib/schemas'
import type { Profile, ProfileId, ProfileSummary } from '@/lib/schemas'

const PROFILE_KEY_PREFIX = 'fracking-asteroids-profile:'
const ACTIVE_PROFILE_KEY = 'fracking-asteroids-active-profile'
const PROFILE_SUMMARIES_KEY = 'fracking-asteroids-profile-summaries'

export function getActiveProfile(): ProfileId | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACTIVE_PROFILE_KEY) as ProfileId | null
}

export function setActiveProfile(profileId: ProfileId): void {
  localStorage.setItem(ACTIVE_PROFILE_KEY, profileId)
}

export function clearActiveProfile(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACTIVE_PROFILE_KEY)
}

export function loadProfileSummaries(): Map<ProfileId, ProfileSummary> {
  if (typeof window === 'undefined') return new Map()
  try {
    const raw = localStorage.getItem(PROFILE_SUMMARIES_KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Map()
    const map = new Map<ProfileId, ProfileSummary>()
    for (const item of parsed) {
      const result = ProfileSummarySchema.safeParse(item)
      if (result.success) map.set(result.data.profileId, result.data)
    }
    return map
  } catch {
    return new Map()
  }
}

export function saveProfileSummary(summary: ProfileSummary): void {
  const map = loadProfileSummaries()
  map.set(summary.profileId, summary)
  localStorage.setItem(PROFILE_SUMMARIES_KEY, JSON.stringify([...map.values()]))
}

export function clearProfileSummary(profileId: ProfileId): void {
  const map = loadProfileSummaries()
  map.delete(profileId)
  localStorage.setItem(PROFILE_SUMMARIES_KEY, JSON.stringify([...map.values()]))
}

export function useGamePersistence(profileId: ProfileId | null) {
  const save = useCallback(
    async (profile: Profile) => {
      if (!profileId) return
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(`${PROFILE_KEY_PREFIX}${profileId}`, JSON.stringify(profile))
        saveProfileSummary({ profileId, timestamp: profile.timestamp, highScore: profile.highScore })
      } catch {
        // ignore quota errors silently
      }
    },
    [profileId],
  )

  const load = useCallback(async (): Promise<Profile | null> => {
    if (!profileId) return null
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(`${PROFILE_KEY_PREFIX}${profileId}`)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      const result = ProfileSchema.safeParse(parsed)
      return result.success ? result.data : null
    } catch {
      return null
    }
  }, [profileId])

  const erase = useCallback(() => {
    if (!profileId) return
    if (typeof window === 'undefined') return
    localStorage.removeItem(`${PROFILE_KEY_PREFIX}${profileId}`)
    clearProfileSummary(profileId)
  }, [profileId])

  return { save, load, erase }
}
