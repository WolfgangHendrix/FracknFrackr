'use client'

import { useCallback } from 'react'
import { GameStateSchema } from '@/lib/schemas'
import type { GameState, SaveSlotId } from '@/lib/schemas'
import { saveSlotSummary } from '@/components/StartScreen'

const SAVE_KEY_PREFIX = 'fracking-asteroids-save:'
const ACTIVE_SLOT_KEY = 'fracking-asteroids-active-slot'

export function getActiveSlot(): SaveSlotId | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACTIVE_SLOT_KEY) as SaveSlotId | null
}

export function setActiveSlot(slotId: SaveSlotId): void {
  localStorage.setItem(ACTIVE_SLOT_KEY, slotId)
}

export function clearActiveSlot(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACTIVE_SLOT_KEY)
}

export function useGamePersistence(slotId: SaveSlotId | null) {
  const save = useCallback(
    async (state: GameState) => {
      if (!slotId) return
      if (typeof window === 'undefined') return
      try {
        localStorage.setItem(`${SAVE_KEY_PREFIX}${slotId}`, JSON.stringify(state))
        saveSlotSummary({ slotId, timestamp: state.timestamp })
      } catch {
        // ignore quota errors silently
      }
    },
    [slotId],
  )

  const load = useCallback(async (): Promise<GameState | null> => {
    if (!slotId) return null
    if (typeof window === 'undefined') return null
    try {
      const raw = localStorage.getItem(`${SAVE_KEY_PREFIX}${slotId}`)
      if (!raw) return null
      const parsed: unknown = JSON.parse(raw)
      const result = GameStateSchema.safeParse(parsed)
      return result.success ? result.data : null
    } catch {
      return null
    }
  }, [slotId])

  return { save, load }
}
